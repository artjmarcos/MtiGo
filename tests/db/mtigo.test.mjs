// Pruebas de integración contra PostgreSQL real con la migración de producción.
import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { TestDb, expectError, requestInput, inMinutes } from './harness.mjs';

const db = new TestDb();
let A, B, C; // ids de usuarios
let sa, sb, sc, anon;

before(async () => {
  await db.start();
  A = await db.createUser('Ana');
  B = await db.createUser('Benja');
  C = await db.createUser('Carla');
  sa = await db.session(A); sb = await db.session(B); sc = await db.session(C);
  anon = await db.session(null, 'anon');
});
after(async () => { await db.stop(); });

// Los límites (5 solicitudes activas, 3 colaboraciones activas) se prueban en
// casos propios. Antes de cada prueba se archiva lo que dejaron abiertas las
// pruebas anteriores, para que cada caso parta de un estado limpio.
beforeEach(async () => {
  const admin = await db.admin();
  await admin.query(`update public.request_assignments set status = 'cancelada', finished_at = now() where status = 'activa'`);
  await admin.query(`update public.requests set status = 'cancelada'
                      where status in ('disponible', 'aceptada', 'en_proceso', 'evidencia_entregada')`);
});

async function uploadAs(session, path) {
  return session.query(
    `insert into storage.objects (bucket_id, name, owner_id) values ('evidence', $1, auth.uid()::text) returning name`,
    [path]);
}

async function newRequest(session = sa, overrides = {}) {
  const [r] = await session.rpc('create_request', requestInput(overrides));
  return r;
}

describe('Migración', () => {
  test('se puede volver a ejecutar sin errores (idempotente)', async () => {
    const admin = await db.admin();
    const sql = readFileSync(new URL('../../supabase/migrations/20261120000001_mtigo_mvp.sql', import.meta.url), 'utf8');
    await admin.query(sql);
    const { rows } = await admin.query(`select count(*)::int n from public.categories`);
    assert.equal(rows[0].n, 8);
  });
});

describe('Autenticación y perfiles', () => {
  test('el registro crea perfil y datos privados automáticamente', async () => {
    const rows = await sa.query(`select display_name, accepted_terms_at from public.profiles where id = $1`, [A]);
    assert.equal(rows[0].display_name, 'Ana');
    assert.ok(rows[0].accepted_terms_at);
    const priv = await sa.query(`select user_id from public.profile_private`);
    assert.deepEqual(priv.map((r) => r.user_id), [A]);
  });

  test('anónimo no puede crear solicitudes ni leer datos', async () => {
    await expectError(anon.rpc('create_request', requestInput()), 'permission denied');
    await expectError(anon.query(`select * from public.requests`), 'permission denied');
    await expectError(anon.query(`select * from public.profiles`), 'permission denied');
    const cats = await anon.query(`select slug from public.categories`);
    assert.ok(cats.length >= 8, 'catálogo público legible');
  });

  test('rol authenticated sin usuario en el token es rechazado', async () => {
    const ghost = await db.session(null, 'authenticated');
    await expectError(ghost.rpc('create_request', requestInput()), 'MTIGO_NOT_AUTHENTICATED');
  });

  test('teléfono solo visible para su dueño', async () => {
    await sa.rpc('update_my_profile', { p_display_name: 'Ana V.', p_city_slug: 'villarrica', p_phone: '+56 9 1234 5678', p_notify_new_requests: true });
    const own = await sa.query(`select phone from public.profile_private`);
    assert.equal(own[0].phone, '+56 9 1234 5678');
    const other = await sb.query(`select phone from public.profile_private where user_id = $1`, [A]);
    assert.equal(other.length, 0);
    await expectError(sa.rpc('update_my_profile', { p_display_name: 'A', p_city_slug: 'villarrica', p_phone: null, p_notify_new_requests: true }), 'MTIGO_INVALID_NAME');
    await expectError(sa.rpc('update_my_profile', { p_display_name: 'Ana', p_city_slug: 'villarrica', p_phone: 'abc', p_notify_new_requests: true }), 'MTIGO_INVALID_PHONE');
  });

  test('sin aceptar términos no puede publicar; tras aceptarlos sí', async () => {
    const D = await db.createUser('Dani', { acceptedTerms: false });
    const sd = await db.session(D);
    await expectError(sd.rpc('create_request', requestInput()), 'MTIGO_TERMS_REQUIRED');
    await sd.rpc('accept_terms');
    const [r] = await sd.rpc('create_request', requestInput());
    assert.equal(r.status, 'disponible');
  });
});

describe('Creación de solicitudes (validación en servidor)', () => {
  test('crea y persiste asociada al usuario autenticado', async () => {
    const r = await newRequest();
    assert.equal(r.requester_id, A);
    assert.equal(r.status, 'disponible');
    const hist = await sa.query(`select from_status, to_status from public.request_status_history where request_id = $1`, [r.id]);
    assert.deepEqual(hist, [{ from_status: null, to_status: 'disponible' }]);
  });

  test('rechaza datos inválidos', async () => {
    const cases = [
      [{ p_title: 'abc' }, 'INVALID_TITLE'],
      [{ p_description: 'corta' }, 'INVALID_DESCRIPTION'],
      [{ p_category_slug: 'inexistente' }, 'INVALID_CATEGORY'],
      [{ p_reward_clp: 50 }, 'INVALID_REWARD'],
      [{ p_reward_clp: 999999 }, 'INVALID_REWARD'],
      [{ p_address: '' }, 'INVALID_ADDRESS'],
      [{ p_city_slug: 'pucon' }, 'INVALID_CITY'], // aún inactiva
      [{ p_expires_at: inMinutes(2) }, 'INVALID_EXPIRY'],
      [{ p_expires_at: inMinutes(60 * 80) }, 'INVALID_EXPIRY'],
      [{ p_lat: -39.28, p_lng: null }, 'INVALID_LOCATION'],
      [{ p_lat: null, p_lng: null, p_radius_m: 500 }, 'INVALID_RADIUS'],
      [{ p_radius_m: 10 }, 'INVALID_RADIUS'],
    ];
    for (const [ov, code] of cases) await expectError(sc.rpc('create_request', requestInput(ov)), `MTIGO_${code}`);
  });

  test('protección contra duplicados: el mismo envío no crea dos solicitudes', async () => {
    const input = requestInput();
    const [r1] = await sc.rpc('create_request', input);
    const [r2] = await sc.rpc('create_request', input);
    assert.equal(r1.id, r2.id);
    const rows = await sc.query(`select count(*)::int n from public.requests where client_request_id = $1`, [input.p_client_request_id]);
    assert.equal(rows[0].n, 1);
  });

  test('límite de 5 solicitudes activas por usuario', async () => {
    const E = await db.createUser('Eva');
    const se = await db.session(E);
    for (let i = 0; i < 5; i++) await se.rpc('create_request', requestInput());
    await expectError(se.rpc('create_request', requestInput()), 'MTIGO_TOO_MANY_ACTIVE');
  });

  test('ubicación manual sin coordenadas es válida', async () => {
    const r = await newRequest(sc, { p_lat: null, p_lng: null, p_radius_m: null, p_address: 'Plaza de Armas' });
    assert.equal(r.lat, null);
  });
});

describe('Permisos', () => {
  test('el cliente no puede escribir tablas directamente', async () => {
    const r = await newRequest();
    await expectError(sb.query(`update public.requests set status = 'aprobada' where id = $1`, [r.id]), 'permission denied');
    await expectError(sa.query(`update public.requests set reward_clp = 1 where id = $1`, [r.id]), 'permission denied');
    await expectError(sa.query(`delete from public.requests where id = $1`, [r.id]), 'permission denied');
    await expectError(sb.query(`insert into public.request_assignments (request_id, collaborator_id, due_at) values ($1, $2, now())`, [r.id, B]), 'permission denied');
    await expectError(sb.query(`insert into public.notifications (user_id, kind, title, body) values ($1, 'nueva_solicitud', 'x', 'y')`, [A]), 'permission denied');
  });

  test('no se puede cancelar una solicitud ajena', async () => {
    const r = await newRequest();
    await expectError(sb.rpc('cancel_request', { p_request_id: r.id, p_reason: 'x' }), 'MTIGO_NOT_ALLOWED');
  });

  test('no se puede aceptar la propia solicitud', async () => {
    const r = await newRequest();
    await expectError(sa.rpc('accept_request', { p_request_id: r.id }), 'MTIGO_OWN_REQUEST');
  });

  test('funciones internas no son invocables por el cliente', async () => {
    const r = await newRequest();
    await expectError(sb.rpc('_set_status', { p_request_id: r.id, p_to: 'aprobada', p_actor: B }), 'permission denied');
    await expectError(sb.rpc('_notify', { p_user: A, p_kind: 'nueva_solicitud', p_request: r.id, p_title: 'x', p_body: 'y' }), 'permission denied');
  });

  test('solicitudes tomadas por otro no son visibles para terceros', async () => {
    const r = await newRequest();
    await sb.rpc('accept_request', { p_request_id: r.id });
    const forC = await sc.query(`select id from public.requests where id = $1`, [r.id]);
    assert.equal(forC.length, 0);
    const forB = await sb.query(`select id from public.requests where id = $1`, [r.id]);
    assert.equal(forB.length, 1);
  });

  test('avisos solo visibles para su destinatario', async () => {
    const rows = await sb.query(`select distinct user_id from public.notifications`);
    assert.ok(rows.every((r) => r.user_id === B));
  });
});

describe('Aceptación atómica (caso crítico)', () => {
  test('dos colaboradores aceptan a la vez: solo uno obtiene la asignación', async () => {
    const r = await newRequest();
    const results = await Promise.allSettled([
      sb.rpc('accept_request', { p_request_id: r.id }),
      sc.rpc('accept_request', { p_request_id: r.id }),
    ]);
    const ok = results.filter((x) => x.status === 'fulfilled');
    const ko = results.filter((x) => x.status === 'rejected');
    assert.equal(ok.length, 1, 'exactamente una aceptación exitosa');
    assert.equal(ko.length, 1);
    assert.match(ko[0].reason.message, /MTIGO_ALREADY_TAKEN/);
    const rows = await sa.query(`select count(*)::int n from public.request_assignments where request_id = $1`, [r.id]);
    assert.equal(rows[0].n, 1);
  });

  test('ocho colaboradores en paralelo: solo uno gana', async () => {
    const r = await newRequest();
    const ids = await Promise.all(Array.from({ length: 8 }, (_, i) => db.createUser(`Colab${i}`)));
    const sessions = await Promise.all(ids.map((id) => db.session(id)));
    const results = await Promise.allSettled(sessions.map((s) => s.rpc('accept_request', { p_request_id: r.id })));
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    const [row] = await sa.query(`select status from public.requests where id = $1`, [r.id]);
    assert.equal(row.status, 'aceptada');
  });

  test('índice único impide dos asignaciones activas aunque se salte la función', async () => {
    const r = await newRequest();
    await sb.rpc('accept_request', { p_request_id: r.id });
    const admin = await db.admin();
    await expectError(admin.query(
      `insert into public.request_assignments (request_id, collaborator_id, due_at) values ($1, $2, now() + interval '1 hour')`, [r.id, C]),
    'request_assignments_one_active');
  });
});

describe('Solicitudes vencidas', () => {
  test('no se puede aceptar una solicitud vencida y el proceso la marca como vencida', async () => {
    const r = await newRequest();
    const admin = await db.admin();
    await admin.query(`update public.requests set created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute' where id = $1`, [r.id]);
    await expectError(sb.rpc('accept_request', { p_request_id: r.id }), 'MTIGO_EXPIRED');
    const list = await sb.rpc('list_available_requests', {});
    assert.ok(!list.some((x) => x.id === r.id), 'no aparece en el listado');
    await sb.rpc('expire_overdue_requests');
    const [row] = await sa.query(`select status from public.requests where id = $1`, [r.id]);
    assert.equal(row.status, 'vencida');
  });

  test('colaborador que no entrega a tiempo: la asignación vence', async () => {
    const r = await newRequest();
    await sb.rpc('accept_request', { p_request_id: r.id });
    const admin = await db.admin();
    await admin.query(`update public.request_assignments set due_at = now() - interval '1 second' where request_id = $1`, [r.id]);
    await expectError(sb.rpc('start_submission', { p_request_id: r.id }), 'MTIGO_EXPIRED');
    await sb.rpc('expire_overdue_requests');
    const [row] = await sa.query(`select status from public.requests where id = $1`, [r.id]);
    assert.equal(row.status, 'vencida');
  });
});

describe('Listado y filtros', () => {
  test('filtros por categoría, recompensa, texto y distancia', async () => {
    const F = await db.createUser('Fer');
    const sf = await db.session(F);
    const r1 = await newRequest(sf, { p_title: 'Fila en BancoEstado', p_category_slug: 'banco', p_reward_clp: 3000 });
    const r2 = await newRequest(sf, { p_title: 'Playa llena hoy', p_category_slug: 'turismo', p_reward_clp: 500, p_lat: -39.26, p_lng: -72.10 });
    const byCat = await sc.rpc('list_available_requests', { p_category_slug: 'banco' });
    assert.ok(byCat.some((x) => x.id === r1.id) && !byCat.some((x) => x.id === r2.id));
    const byReward = await sc.rpc('list_available_requests', { p_min_reward: 2000 });
    assert.ok(byReward.every((x) => x.reward_clp >= 2000));
    const byText = await sc.rpc('list_available_requests', { p_search: 'bancoestado' });
    assert.deepEqual(byText.map((x) => x.id), [r1.id]);
    const near = await sc.rpc('list_available_requests', { p_lat: -39.2826, p_lng: -72.2272, p_radius_km: 2 });
    assert.ok(near.some((x) => x.id === r1.id) && !near.some((x) => x.id === r2.id));
    assert.equal(near.find((x) => x.id === r1.id).distance_m, 0);
    const own = await sf.rpc('list_available_requests', {});
    assert.ok(!own.some((x) => x.requester_id === F), 'no muestra mis propias solicitudes');
  });
});

describe('Entrega y revisión de evidencia', () => {
  test('flujo completo con foto y texto, aprobación e historial', async () => {
    const r = await newRequest();
    await sb.rpc('accept_request', { p_request_id: r.id });
    const [sub] = await sb.rpc('start_submission', { p_request_id: r.id });
    const filePath = `${r.id}/${sub.id}/${randomUUID()}.jpg`;

    // Un tercero no puede subir archivos a esta entrega.
    await expectError(uploadAs(sc, filePath), 'row-level security');
    // Registrar un archivo que no existe en Storage falla: no hay subidas simuladas.
    await expectError(sb.rpc('add_evidence_file', { p_submission_id: sub.id, p_storage_path: filePath, p_mime_type: 'image/jpeg', p_size_bytes: 1234 }), 'MTIGO_FILE_NOT_UPLOADED');
    // Sin foto no puede entregar.
    await expectError(sb.rpc('submit_evidence', { p_submission_id: sub.id, p_body_text: 'Está abierta' }), 'MTIGO_EVIDENCE_PHOTO_REQUIRED');

    await uploadAs(sb, filePath);
    await sb.rpc('add_evidence_file', { p_submission_id: sub.id, p_storage_path: filePath, p_mime_type: 'image/jpeg', p_size_bytes: 1234 });
    // El solicitante no ve el borrador.
    assert.equal((await sa.query(`select * from public.evidence_submissions where id = $1`, [sub.id])).length, 0);
    assert.equal((await sa.query(`select * from storage.objects where name = $1`, [filePath])).length, 0);
    // Sin texto no puede entregar (requiere foto y texto).
    await expectError(sb.rpc('submit_evidence', { p_submission_id: sub.id, p_body_text: '' }), 'MTIGO_EVIDENCE_TEXT_REQUIRED');
    // Solo el colaborador asignado entrega.
    await expectError(sc.rpc('submit_evidence', { p_submission_id: sub.id, p_body_text: 'hola' }), 'MTIGO_NOT_ALLOWED');

    const [done] = await sb.rpc('submit_evidence', { p_submission_id: sub.id, p_body_text: 'Sí, está abierta y sin fila.' });
    assert.equal(done.status, 'entregada');

    // Ahora el solicitante ve texto y foto; un tercero no.
    assert.equal((await sa.query(`select body_text from public.evidence_submissions where id = $1`, [sub.id]))[0].body_text, 'Sí, está abierta y sin fila.');
    assert.equal((await sa.query(`select name from storage.objects where name = $1`, [filePath])).length, 1);
    assert.equal((await sc.query(`select name from storage.objects where name = $1`, [filePath])).length, 0);
    assert.equal((await sc.query(`select * from public.evidence_files`)).filter((f) => f.storage_path === filePath).length, 0);

    // El colaborador no puede aprobar su propia entrega.
    await expectError(sb.rpc('review_evidence', { p_request_id: r.id, p_approve: true, p_reason: null }), 'MTIGO_NOT_ALLOWED');
    const [approved] = await sa.rpc('review_evidence', { p_request_id: r.id, p_approve: true, p_reason: null });
    assert.equal(approved.status, 'aprobada');
    // No se puede revisar dos veces.
    await expectError(sa.rpc('review_evidence', { p_request_id: r.id, p_approve: false, p_reason: 'otra vez' }), 'MTIGO_INVALID_STATE');

    const hist = (rows) => rows.map((h) => h.to_status);
    const expected = ['disponible', 'aceptada', 'en_proceso', 'evidencia_entregada', 'aprobada'];
    const q = `select to_status from public.request_status_history where request_id = $1 order by id`;
    assert.deepEqual(hist(await sa.query(q, [r.id])), expected, 'historial visible para el solicitante');
    assert.deepEqual(hist(await sb.query(q, [r.id])), expected, 'historial visible para el colaborador');
    assert.equal((await sc.query(q, [r.id])).length, 0, 'tercero no ve el historial');

    const kinds = (await sb.query(`select kind from public.notifications where request_id = $1`, [r.id])).map((n) => n.kind);
    assert.ok(kinds.includes('solicitud_aprobada'));
    const kindsA = (await sa.query(`select kind from public.notifications where request_id = $1`, [r.id])).map((n) => n.kind);
    assert.ok(kindsA.includes('solicitud_aceptada') && kindsA.includes('evidencia_entregada'));
  });

  test('rechazo exige motivo y queda registrado', async () => {
    const r = await newRequest(sa, { p_evidence_type: 'texto' });
    await sb.rpc('accept_request', { p_request_id: r.id });
    const [sub] = await sb.rpc('start_submission', { p_request_id: r.id });
    await sb.rpc('submit_evidence', { p_submission_id: sub.id, p_body_text: 'No sé' });
    await expectError(sa.rpc('review_evidence', { p_request_id: r.id, p_approve: false, p_reason: '' }), 'MTIGO_REASON_REQUIRED');
    const [rej] = await sa.rpc('review_evidence', { p_request_id: r.id, p_approve: false, p_reason: 'La respuesta no confirma nada' });
    assert.equal(rej.status, 'rechazada');
    assert.equal(rej.rejection_reason, 'La respuesta no confirma nada');
    const [h] = await sb.query(`select to_status, note from public.request_status_history where request_id = $1 order by id desc limit 1`, [r.id]);
    assert.deepEqual(h, { to_status: 'rechazada', note: 'La respuesta no confirma nada' });
  });

  test('evidencia solo de foto: no exige texto', async () => {
    const r = await newRequest(sa, { p_evidence_type: 'foto' });
    await sc.rpc('accept_request', { p_request_id: r.id });
    const [sub] = await sc.rpc('start_submission', { p_request_id: r.id });
    const p = `${r.id}/${sub.id}/${randomUUID()}.webp`;
    await uploadAs(sc, p);
    await sc.rpc('add_evidence_file', { p_submission_id: sub.id, p_storage_path: p, p_mime_type: 'image/webp', p_size_bytes: 500 });
    const [s] = await sc.rpc('submit_evidence', { p_submission_id: sub.id, p_body_text: null });
    assert.equal(s.status, 'entregada');
  });

  test('máximo 4 fotos y nombres de archivo seguros', async () => {
    const r = await newRequest(sa, { p_evidence_type: 'foto' });
    await sb.rpc('accept_request', { p_request_id: r.id });
    const [sub] = await sb.rpc('start_submission', { p_request_id: r.id });
    await expectError(uploadAs(sb, `${r.id}/${sub.id}/../../hack.jpg`), 'row-level security');
    await expectError(uploadAs(sb, `${r.id}/${sub.id}/x.exe`), 'row-level security');
    for (let i = 0; i < 5; i++) {
      const p = `${r.id}/${sub.id}/${randomUUID()}.jpg`;
      await uploadAs(sb, p);
      const call = sb.rpc('add_evidence_file', { p_submission_id: sub.id, p_storage_path: p, p_mime_type: 'image/jpeg', p_size_bytes: 100 });
      if (i < 4) await call; else await expectError(call, 'MTIGO_TOO_MANY_FILES');
    }
  });

  test('quitar una foto del borrador; no se puede después de entregar', async () => {
    const r = await newRequest(sa, { p_evidence_type: 'foto' });
    await sb.rpc('accept_request', { p_request_id: r.id });
    const [sub] = await sb.rpc('start_submission', { p_request_id: r.id });
    const p1 = `${r.id}/${sub.id}/${randomUUID()}.jpg`;
    const p2 = `${r.id}/${sub.id}/${randomUUID()}.jpg`;
    await uploadAs(sb, p1); await uploadAs(sb, p2);
    const [f1] = await sb.rpc('add_evidence_file', { p_submission_id: sub.id, p_storage_path: p1, p_mime_type: 'image/jpeg', p_size_bytes: 10 });
    const [f2] = await sb.rpc('add_evidence_file', { p_submission_id: sub.id, p_storage_path: p2, p_mime_type: 'image/jpeg', p_size_bytes: 10 });
    await expectError(sc.rpc('remove_evidence_file', { p_file_id: f1.id }), 'MTIGO_NOT_ALLOWED');
    const [removed] = await sb.rpc('remove_evidence_file', { p_file_id: f1.id });
    assert.equal(removed.remove_evidence_file, p1);
    await sb.query(`delete from storage.objects where bucket_id = 'evidence' and name = $1`, [p1]);
    await sb.rpc('submit_evidence', { p_submission_id: sub.id, p_body_text: null });
    await expectError(sb.rpc('remove_evidence_file', { p_file_id: f2.id }), 'MTIGO_INVALID_STATE');
    const files = await sa.query(`select storage_path from public.evidence_files where submission_id = $1`, [sub.id]);
    assert.deepEqual(files.map((f) => f.storage_path), [p2]);
  });

  test('liberar una solicitud la vuelve a dejar disponible', async () => {
    const r = await newRequest();
    await sb.rpc('accept_request', { p_request_id: r.id });
    await expectError(sc.rpc('release_request', { p_request_id: r.id }), 'MTIGO_NOT_ALLOWED');
    const [rel] = await sb.rpc('release_request', { p_request_id: r.id });
    assert.equal(rel.status, 'disponible');
    const [a] = await sc.rpc('accept_request', { p_request_id: r.id });
    assert.equal(a.collaborator_id, C);
  });

  test('cancelación por el solicitante avisa al colaborador', async () => {
    const r = await newRequest();
    await sb.rpc('accept_request', { p_request_id: r.id });
    const [c] = await sa.rpc('cancel_request', { p_request_id: r.id, p_reason: 'Ya no lo necesito' });
    assert.equal(c.status, 'cancelada');
    const n = await sb.query(`select kind from public.notifications where request_id = $1 and kind = 'solicitud_cancelada'`, [r.id]);
    assert.equal(n.length, 1);
    await expectError(sb.rpc('start_submission', { p_request_id: r.id }), 'MTIGO_NOT_ALLOWED');
  });
});

describe('Mensajes', () => {
  test('solo participantes pueden escribir y leer', async () => {
    const r = await newRequest();
    await expectError(sb.rpc('send_message', { p_request_id: r.id, p_body: 'hola' }), 'MTIGO_NOT_ALLOWED');
    await sb.rpc('accept_request', { p_request_id: r.id });
    await sb.rpc('send_message', { p_request_id: r.id, p_body: 'Voy en camino' });
    await sa.rpc('send_message', { p_request_id: r.id, p_body: 'Gracias' });
    await expectError(sc.rpc('send_message', { p_request_id: r.id, p_body: 'intruso' }), 'MTIGO_NOT_ALLOWED');
    assert.equal((await sa.query(`select * from public.messages where request_id = $1`, [r.id])).length, 2);
    assert.equal((await sc.query(`select * from public.messages where request_id = $1`, [r.id])).length, 0);
  });
});

describe('Moderación', () => {
  test('bloqueo oculta solicitudes e impide aceptar', async () => {
    const G = await db.createUser('Gabo'); const H = await db.createUser('Hugo');
    const sg = await db.session(G); const sh = await db.session(H);
    const r = await newRequest(sg);
    await sh.rpc('block_user', { p_user_id: G });
    const list = await sh.rpc('list_available_requests', {});
    assert.ok(!list.some((x) => x.id === r.id));
    await expectError(sh.rpc('accept_request', { p_request_id: r.id }), 'MTIGO_BLOCKED');
    await sh.rpc('unblock_user', { p_user_id: G });
    await sh.rpc('accept_request', { p_request_id: r.id });
  });

  test('tres reportes distintos ocultan la solicitud', async () => {
    const r = await newRequest();
    const reporters = await Promise.all([1, 2, 3].map((i) => db.createUser(`Rep${i}`)));
    for (const id of reporters) {
      const s = await db.session(id);
      await s.rpc('report_content', { p_reason: 'spam', p_details: 'publicidad', p_request_id: r.id });
      await s.rpc('report_content', { p_reason: 'spam', p_details: 'repetido', p_request_id: r.id }); // duplicado ignorado
    }
    const list = await sc.rpc('list_available_requests', {});
    assert.ok(!list.some((x) => x.id === r.id));
    await expectError(sb.rpc('report_content', { p_reason: 'malo', p_request_id: r.id }), 'reports_reason_check');
  });
});

describe('Eliminación de cuenta', () => {
  test('borra los datos del usuario y libera sus colaboraciones', async () => {
    const X = await db.createUser('Xime');
    const sx = await db.session(X);
    const own = await newRequest(sx);
    const other = await newRequest(await db.session(await db.createUser('Olga')));
    await sx.rpc('accept_request', { p_request_id: other.id });
    await sx.rpc('delete_my_account');
    const admin = await db.admin();
    assert.equal((await admin.query(`select 1 from auth.users where id = $1`, [X])).rowCount, 0);
    assert.equal((await admin.query(`select 1 from public.profiles where id = $1`, [X])).rowCount, 0);
    assert.equal((await admin.query(`select 1 from public.requests where id = $1`, [own.id])).rowCount, 0);
    const [o] = (await admin.query(`select status from public.requests where id = $1`, [other.id])).rows;
    assert.equal(o.status, 'disponible');
  });
});

describe('Límites anti-abuso', () => {
  test('máximo 20 solicitudes por usuario en 24 horas', async () => {
    // A ya publicó muchas en las pruebas anteriores.
    const n = (await sa.query(`select count(*)::int n from public.requests where requester_id = auth.uid()`))[0].n;
    assert.ok(n >= 20);
    await expectError(sa.rpc('create_request', requestInput()), 'MTIGO_RATE_LIMIT');
  });
});

describe('Persistencia', () => {
  test('los datos sobreviven a un reinicio completo del servidor', async () => {
    const P = await db.createUser('Pili');
    const r = await newRequest(await db.session(P), { p_title: 'Persistencia de prueba' });
    await db.restart();
    sa = await db.session(A); sb = await db.session(B); sc = await db.session(C);
    const sp = await db.session(P);
    const rows = await sp.query(`select title, status from public.requests where id = $1`, [r.id]);
    assert.deepEqual(rows, [{ title: 'Persistencia de prueba', status: 'disponible' }]);
  });
});
