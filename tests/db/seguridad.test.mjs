// Pruebas de la auditoría de seguridad (23-11-2026): cada caso fue un ataque
// real que funcionaba antes de la corrección.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TestDb, requestInput, expectError } from './harness.mjs';

const db = new TestDb();
let A, B, C, X, sa, sb, sc, sx;
before(async () => {
  await db.start();
  [A, B, C, X] = await Promise.all(['Ana', 'Benja', 'Carla', 'Mallory'].map((n) => db.createUser(n)));
  [sa, sb, sc, sx] = await Promise.all([A, B, C, X].map((u) => db.session(u)));
});
after(async () => { await db.stop(); });

const upload = (s, path) => s.query(`insert into storage.objects (bucket_id, name, owner_id) values ('evidence', $1, auth.uid()::text) returning name`, [path]);

test('S1: un tercero no puede averiguar bloqueos entre otras personas', async () => {
  await sb.rpc('block_user', { p_user_id: C });
  const [r] = await sx.rpc('_is_blocked_between', { a: B, b: C });
  assert.equal(r._is_blocked_between, false);
  const [own] = await sb.rpc('_is_blocked_between', { a: B, b: C });
  assert.equal(own._is_blocked_between, true, 'el propio usuario sí lo ve');
  await sb.rpc('unblock_user', { p_user_id: C });
});

test('S2: un tercero no puede averiguar quién participa en una solicitud', async () => {
  const [req] = await sa.rpc('create_request', requestInput());
  await sb.rpc('accept_request', { p_request_id: req.id });
  const [r1] = await sx.rpc('is_request_participant', { p_request_id: req.id, p_user: B });
  const [r2] = await sx.rpc('is_request_owner', { p_request_id: req.id, p_user: A });
  assert.equal(r1.is_request_participant, false);
  assert.equal(r2.is_request_owner, false);
});

test('S3: la foto entregada no se puede borrar, salvo al eliminar la cuenta', async () => {
  const [req] = await sa.rpc('create_request', requestInput({ p_evidence_type: 'foto' }));
  await sc.rpc('accept_request', { p_request_id: req.id });
  const [sub] = await sc.rpc('start_submission', { p_request_id: req.id });
  const draft = `${req.id}/${sub.id}/${randomUUID()}.jpg`;
  const kept = `${req.id}/${sub.id}/${randomUUID()}.jpg`;
  await upload(sc, draft); await upload(sc, kept);
  // En borrador sí puede borrar (por ejemplo, una foto mal tomada).
  assert.equal((await sc.query(`delete from storage.objects where name = $1 returning name`, [draft])).length, 1);
  await sc.rpc('add_evidence_file', { p_submission_id: sub.id, p_storage_path: kept, p_mime_type: 'image/jpeg', p_size_bytes: 10 });
  await sc.rpc('submit_evidence', { p_submission_id: sub.id, p_body_text: null });
  // Entregada: ni el colaborador ni el solicitante pueden borrarla.
  assert.equal((await sc.query(`delete from storage.objects where name = $1 returning name`, [kept])).length, 0);
  assert.equal((await sa.query(`delete from storage.objects where name = $1 returning name`, [kept])).length, 0);
  // Eliminación de cuenta: sí puede borrar sus datos.
  await sc.rpc('request_account_deletion');
  assert.equal((await sc.query(`delete from storage.objects where name = $1 returning name`, [kept])).length, 1);
});

test('S4: máximo 8 archivos en Storage por borrador', async () => {
  const [req] = await sa.rpc('create_request', requestInput());
  const D = await db.createUser('Dani'); const sd = await db.session(D);
  await sd.rpc('accept_request', { p_request_id: req.id });
  const [sub] = await sd.rpc('start_submission', { p_request_id: req.id });
  for (let i = 0; i < 8; i++) await upload(sd, `${req.id}/${sub.id}/${randomUUID()}.jpg`);
  await expectError(upload(sd, `${req.id}/${sub.id}/${randomUUID()}.jpg`), 'row-level security');
});

test('S5: no se puede reportar una solicitud que uno no puede ver', async () => {
  const [req] = await sa.rpc('create_request', requestInput());
  await sb.rpc('report_content', { p_reason: 'spam', p_request_id: req.id }); // visible: disponible
  const E = await db.createUser('Eli'); const se = await db.session(E);
  await se.rpc('accept_request', { p_request_id: req.id });
  await expectError(sx.rpc('report_content', { p_reason: 'spam', p_request_id: req.id }), 'MTIGO_NOT_FOUND');
  await se.rpc('report_content', { p_reason: 'otro', p_request_id: req.id }); // participante sí
});

test('Ninguna función es ejecutable por usuarios anónimos', async () => {
  const admin = await db.admin();
  const { rows } = await admin.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      and p.prorettype <> 'trigger'::regtype`);
  assert.deepEqual(rows, []);
});
