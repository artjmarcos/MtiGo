// Entorno local tipo Supabase para pruebas extremo a extremo:
//   PostgreSQL real + Supabase Auth (GoTrue, binario oficial) + PostgREST (binario oficial)
//   + emulador mínimo de Supabase Storage que aplica las MISMAS políticas RLS
//   de storage.objects (inserta/lee/borra como el usuario del JWT).
// Uso: node tests/e2e/stack.mjs  (requiere E2E_BIN con los binarios `postgrest` y `auth/`)
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync as rf } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIN = process.env.E2E_BIN ?? '/home/claude/e2e-bin';
const PG_PORT = 55432, AUTH_PORT = 59999, REST_PORT = 53000, GATEWAY_PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const JWT_SECRET = 'e2e-super-secret-jwt-token-with-at-least-32-characters';
const DATA = '/tmp/mtigo-e2e';
const FILES = `${DATA}/storage`;

const b64url = (b) => Buffer.from(b).toString('base64url');
export function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = String(token ?? '').split('.');
  if (!h || !b || !s) return null;
  const exp = createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== exp.length || !timingSafeEqual(got, exp)) return null;
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}
export const ANON_KEY = signJwt({ role: 'anon', iss: 'supabase', iat: 1700000000, exp: 2100000000 });

const procs = [];
function run(cmd, args, env, cwd) {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${path.basename(cmd)}] ${d}`));
  p.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(`[${path.basename(cmd)}] ${d}`));
  procs.push(p);
  return p;
}
async function waitHttp(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No responde: ${url}`);
}

export async function startStack() {
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(FILES, { recursive: true });
  const db = new EmbeddedPostgres({ databaseDir: `${DATA}/pg`, user: 'postgres', password: 'postgres', port: PG_PORT, persistent: false, createPostgresUser: true, onLog: () => {}, onError: () => {} });
  await db.initialise();
  await db.start();
  const admin = new pg.Client({ host: 'localhost', port: PG_PORT, user: 'postgres', password: 'postgres', database: 'postgres' });
  await admin.connect();

  // Roles y esquemas como en Supabase.
  await admin.query(`
    create role anon nologin noinherit; create role authenticated nologin noinherit; create role service_role nologin noinherit bypassrls;
    create role authenticator login password 'pw' noinherit; grant anon, authenticated, service_role to authenticator;
    create role supabase_auth_admin login password 'pw' createrole;
    create schema auth authorization supabase_auth_admin;
    grant usage on schema auth to anon, authenticated, service_role;
    alter role supabase_auth_admin set search_path = auth;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create extension if not exists pgcrypto;
  `);

  // Supabase Auth (migra su esquema y queda escuchando).
  const authEnv = {
    GOTRUE_DB_DRIVER: 'postgres',
    DATABASE_URL: `postgres://supabase_auth_admin:pw@localhost:${PG_PORT}/postgres?sslmode=disable`,
    GOTRUE_JWT_SECRET: JWT_SECRET, GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_SITE_URL: 'http://localhost:5173', API_EXTERNAL_URL: `http://localhost:${GATEWAY_PORT}/auth/v1`,
    GOTRUE_API_HOST: '127.0.0.1', PORT: String(AUTH_PORT),
    GOTRUE_MAILER_AUTOCONFIRM: 'true', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_DISABLE_SIGNUP: 'false',
    GOTRUE_PASSWORD_MIN_LENGTH: '8', GOTRUE_LOG_LEVEL: 'warn',
    GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000', GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '1000', GOTRUE_RATE_LIMIT_VERIFY: '1000',
    GOTRUE_SMTP_HOST: 'localhost', GOTRUE_SMTP_PORT: '2500', GOTRUE_SMTP_ADMIN_EMAIL: 'admin@localhost',
  };
  const authDir = path.join(BIN, 'auth');
  await new Promise((res, rej) => run(path.join(authDir, 'auth'), ['migrate'], authEnv, authDir).on('exit', (c) => (c === 0 ? res() : rej(new Error(`auth migrate ${c}`)))));
  run(path.join(authDir, 'auth'), ['serve'], authEnv, authDir);
  await waitHttp(`http://127.0.0.1:${AUTH_PORT}/health`);

  // Esquema storage mínimo + migración REAL de MtiGo.
  await admin.query(`
    create schema storage; grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null,
      owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(), unique (bucket_id, name));
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated, service_role;
    grant select on storage.buckets to anon, authenticated, service_role;
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  `);
  await admin.query(readFileSync(path.join(root, 'supabase/migrations/20261120000001_mtigo_mvp.sql'), 'utf8'));
  await admin.query(`notify pgrst, 'reload schema'`);

  // PostgREST.
  writeFileSync(`${DATA}/postgrest.conf`, [
    `db-uri = "postgres://authenticator:pw@localhost:${PG_PORT}/postgres"`,
    `db-schemas = "public"`, `db-anon-role = "anon"`, `jwt-secret = "${JWT_SECRET}"`,
    `server-port = ${REST_PORT}`, `server-host = "127.0.0.1"`, `db-pool = 10`,
  ].join('\n'));
  run(path.join(BIN, 'postgrest'), [`${DATA}/postgrest.conf`], {});
  await waitHttp(`http://127.0.0.1:${REST_PORT}/`);

  // Emulador de Storage + gateway (como https://<proyecto>.supabase.co).
  const pool = new pg.Pool({ host: 'localhost', port: PG_PORT, user: 'postgres', password: 'postgres', database: 'postgres', max: 10 });
  async function asUser(claims, fn) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`set local role ${claims.role === 'authenticated' ? 'authenticated' : 'anon'}`);
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
  }
  const cors = {
    'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
  };
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { ...cors, 'content-type': 'application/json', ...headers });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const readBody = (req) => new Promise((r) => { const ch = []; req.on('data', (d) => ch.push(d)); req.on('end', () => r(Buffer.concat(ch))); });

  async function storage(req, res, url) {
    const p = url.pathname.replace(/^\/storage\/v1/, '');
    // Descarga con URL firmada.
    let m = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(p);
    if (req.method === 'GET' && m) {
      const tok = verifyJwt(url.searchParams.get('token'));
      const key = `${m[1]}/${decodeURIComponent(m[2])}`;
      if (!tok || tok.url !== key) return send(res, 400, { statusCode: '403', error: 'InvalidSignature', message: 'Invalid signature' });
      const file = path.join(FILES, key);
      if (!existsSync(file)) return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return send(res, 200, rf(file), { 'content-type': tok.ct ?? 'image/jpeg' });
    }
    const claims = verifyJwt((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    if (!claims) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'Invalid JWT' });
    // Firmar URLs (solo objetos que el usuario puede LEER según RLS).
    m = /^\/object\/sign\/([^/]+)$/.exec(p);
    if (req.method === 'POST' && m) {
      const { paths, expiresIn } = JSON.parse((await readBody(req)).toString());
      const visible = await asUser(claims, async (c) => (await c.query(
        `select name, metadata->>'mimetype' ct from storage.objects where bucket_id = $1 and name = any($2)`, [m[1], paths])).rows);
      return send(res, 200, paths.map((name) => {
        const v = visible.find((x) => x.name === name);
        if (!v) return { path: name, signedURL: null, error: 'Either the object does not exist or you do not have access to it' };
        const token = signJwt({ url: `${m[1]}/${name}`, ct: v.ct, exp: Math.floor(Date.now() / 1000) + expiresIn });
        return { path: name, signedURL: `/object/sign/${m[1]}/${name.split('/').map(encodeURIComponent).join('/')}?token=${token}`, error: null };
      }));
    }
    // Subir (multipart, como supabase-js) aplicando RLS de INSERT.
    m = /^\/object\/([^/]+)\/(.+)$/.exec(p);
    if (req.method === 'POST' && m) {
      const bucket = m[1]; const name = decodeURIComponent(m[2]);
      const body = await readBody(req);
      const form = await new Request('http://x', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body }).formData();
      const file = [...form.values()].find((v) => typeof v !== 'string');
      if (!file) return send(res, 400, { statusCode: '400', error: 'invalid', message: 'No file' });
      const [b] = (await pool.query(`select * from storage.buckets where id = $1`, [bucket])).rows;
      if (!b) return send(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
      if (b.file_size_limit && file.size > Number(b.file_size_limit)) return send(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
      if (b.allowed_mime_types && !b.allowed_mime_types.includes(file.type)) return send(res, 415, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${file.type} is not supported` });
      try {
        await asUser(claims, (c) => c.query(`insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ($1, $2, $3, $4, $5)`,
          [bucket, name, claims.sub, claims.sub, { mimetype: file.type, size: file.size }]));
      } catch (e) {
        const dup = /duplicate key/.test(e.message);
        if (process.env.E2E_VERBOSE) console.error('[storage]', e.message);
        return send(res, dup ? 409 : 400, { statusCode: dup ? '409' : '403', error: dup ? 'Duplicate' : 'Unauthorized', message: dup ? 'The resource already exists' : 'new row violates row-level security policy' });
      }
      const dest = path.join(FILES, bucket, name);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
      return send(res, 200, { Key: `${bucket}/${name}`, Id: randomUUID() });
    }
    // Borrar (RLS de DELETE).
    m = /^\/object\/([^/]+)$/.exec(p);
    if (req.method === 'DELETE' && m) {
      const { prefixes } = JSON.parse((await readBody(req)).toString());
      const rows = await asUser(claims, async (c) => (await c.query(`delete from storage.objects where bucket_id = $1 and name = any($2) returning name`, [m[1], prefixes])).rows);
      for (const r of rows) rmSync(path.join(FILES, m[1], r.name), { force: true });
      return send(res, 200, rows.map((r) => ({ name: r.name, bucket_id: m[1] })));
    }
    return send(res, 404, { statusCode: '404', error: 'not_found', message: `Ruta no emulada: ${req.method} ${p}` });
  }

  function proxy(req, res, target, stripPrefix) {
    const u = new URL(req.url, 'http://x');
    const r = http.request({ host: '127.0.0.1', port: target, path: u.pathname.replace(stripPrefix, '') + u.search, method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${target}` } }, (pr) => {
      const headers = { ...pr.headers, ...cors };
      res.writeHead(pr.statusCode ?? 502, headers);
      pr.pipe(res);
    });
    r.on('error', (e) => send(res, 502, { message: e.message }));
    req.pipe(r);
  }

  const gateway = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/auth/v1')) return proxy(req, res, AUTH_PORT, /^\/auth\/v1/);
    if (url.pathname.startsWith('/rest/v1')) return proxy(req, res, REST_PORT, /^\/rest\/v1/);
    if (url.pathname.startsWith('/storage/v1')) return storage(req, res, url).catch((e) => send(res, 500, { message: e.message }));
    send(res, 404, { message: 'not found' });
  });
  await new Promise((r) => gateway.listen(GATEWAY_PORT, '127.0.0.1', r));

  return {
    url: `http://127.0.0.1:${GATEWAY_PORT}`,
    anonKey: ANON_KEY,
    pool, admin,
    async stop() {
      gateway.close();
      for (const p of procs) p.kill('SIGTERM');
      await pool.end(); await admin.end();
      await db.stop();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startStack();
  console.log(`Stack listo en ${s.url}\nANON_KEY=${s.anonKey}`);
  process.on('SIGINT', async () => { await s.stop(); process.exit(0); });
}
