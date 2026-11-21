// Arnés de pruebas: PostgreSQL real (embebido) + migración real de MtiGo.
// Cada llamada RPC se ejecuta igual que PostgREST/Supabase: transacción propia,
// rol "authenticated" y el JWT del usuario en request.jwt.claims.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STUB = readFileSync(path.join(root, 'supabase/local/00_supabase_stub.sql'), 'utf8');
// Todas las migraciones en orden, salvo la de pg_cron (extensión no disponible localmente).
export const MIGRATION = readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql') && !f.includes('vencimiento_automatico')).sort()
  .map((f) => readFileSync(path.join(root, 'supabase/migrations', f), 'utf8')).join('\n;\n');

export class TestDb {
  constructor(port = 54000 + Math.floor(Math.random() * 1000)) {
    this.port = port;
    this.dir = `/tmp/mtigo-pg-${port}`;
    this.clients = [];
  }

  async start({ fresh = true } = {}) {
    if (fresh) rmSync(this.dir, { recursive: true, force: true });
    this.pg = new EmbeddedPostgres({
      databaseDir: this.dir, user: 'postgres', password: 'postgres', port: this.port,
      persistent: true, createPostgresUser: true, onLog: () => {}, onError: () => {},
    });
    if (fresh) await this.pg.initialise();
    await this.pg.start();
    if (fresh) {
      const admin = await this.admin();
      await admin.query(STUB);
      await admin.query(MIGRATION);
    }
  }

  /** Reinicia el servidor PostgreSQL conservando los datos (prueba de persistencia). */
  async restart() {
    await this.closeClients();
    await this.pg.stop();
    await this.start({ fresh: false });
  }

  async stop() {
    await this.closeClients();
    if (this.pg) await this.pg.stop();
    rmSync(this.dir, { recursive: true, force: true });
  }

  async closeClients() {
    for (const c of this.clients) { try { await c.end(); } catch { /* ya cerrado */ } }
    this.clients = [];
  }

  async connect() {
    const c = new pg.Client({ host: 'localhost', port: this.port, user: 'postgres', password: 'postgres', database: 'postgres' });
    await c.connect();
    this.clients.push(c);
    return c;
  }

  async admin() {
    if (!this._admin || this._admin._ending) this._admin = await this.connect();
    return this._admin;
  }

  /** Simula el registro de Supabase Auth (inserta en auth.users). */
  async createUser(name, { acceptedTerms = true } = {}) {
    const admin = await this.admin();
    const email = `${name.toLowerCase().replace(/\W/g, '')}-${randomUUID().slice(0, 6)}@test.local`;
    const { rows } = await admin.query(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [email, { display_name: name, accepted_terms: acceptedTerms ? 'true' : 'false' }]);
    return rows[0].id;
  }

  /** Sesión con su propia conexión (permite pruebas concurrentes reales). */
  async session(userId, role = 'authenticated') {
    const client = await this.connect();
    return new Session(client, userId, role);
  }
}

export class Session {
  constructor(client, userId, role) { this.client = client; this.userId = userId; this.role = role; }

  async run(fn) {
    const c = this.client;
    await c.query('begin');
    try {
      await c.query(`set local role ${this.role}`);
      const claims = this.userId ? JSON.stringify({ sub: this.userId, role: this.role }) : '';
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback');
      throw e;
    }
  }

  /** Igual que supabase.rpc(nombre, { parametros }). */
  rpc(name, params = {}) {
    const keys = Object.keys(params);
    const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    return this.run(async (c) => (await c.query(`select * from public.${name}(${args})`, keys.map((k) => params[k]))).rows);
  }

  query(sql, params = []) {
    return this.run(async (c) => (await c.query(sql, params)).rows);
  }
}

/** Espera un error de negocio MTIGO_<code> (o un mensaje que contenga el texto). */
export async function expectError(promise, code) {
  try {
    await promise;
  } catch (e) {
    if (!String(e.message).includes(code)) {
      throw new Error(`Se esperaba "${code}" pero llegó: ${e.message}`);
    }
    return e;
  }
  throw new Error(`Se esperaba el error "${code}" pero la operación tuvo éxito`);
}

export const inMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();

export function requestInput(overrides = {}) {
  return {
    p_client_request_id: randomUUID(),
    p_title: '¿Está abierta la farmacia?',
    p_description: 'Necesito saber si la farmacia de la esquina está atendiendo ahora.',
    p_category_slug: 'comercio',
    p_evidence_type: 'foto_texto',
    p_reward_clp: 1000,
    p_address: 'Pedro de Valdivia 500, Villarrica',
    p_city_slug: 'villarrica',
    p_expires_at: inMinutes(60),
    p_lat: -39.2826,
    p_lng: -72.2272,
    p_radius_m: 500,
    ...overrides,
  };
}
