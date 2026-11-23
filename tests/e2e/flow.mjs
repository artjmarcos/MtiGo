// Prueba extremo a extremo con dos usuarios en dos "teléfonos" (Chrome móvil):
// A crea, B acepta y entrega foto + texto, A aprueba; ambos ven historial;
// los datos persisten al recargar; un tercero no puede ver la solicitud.
// También: rechazo con motivo y aceptación simultánea desde la interfaz.
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { startStack } from './stack.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = path.join(root, 'tests/e2e/screens');
const APP_PORT = 5173;
const results = [];
const consoleErrors = [];

function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) throw new Error(`Falló: ${name} ${detail}`);
}

const stack = await startStack();
let browser; let server;
try {
  // 1) Compilación de producción apuntando al entorno local.
  execFileSync('npx', ['vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir'], {
    cwd: root, stdio: 'pipe',
    env: { ...process.env, VITE_SUPABASE_URL: stack.url, VITE_SUPABASE_ANON_KEY: stack.anonKey, VITE_PUBLIC_WEB_URL: `http://127.0.0.1:${APP_PORT}/`, VITE_SUPPORT_EMAIL: 'soporte@ejemplo.cl', VITE_AUTH_PROVIDERS: 'google' },
  });
  const dist = path.join(root, 'dist-e2e');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(dist, p === '/' ? 'index.html' : p);
    if (!f.startsWith(dist) || !existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(APP_PORT, '127.0.0.1', r));
  const APP = `http://127.0.0.1:${APP_PORT}/`;

  // Foto de prueba (JPEG real 2400x1800 para probar la compresión).
  const photo = '/tmp/mtigo-e2e-photo.jpg';
  await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#90caf9' } })
    .composite([{ input: Buffer.from(`<svg width="2400" height="1800"><rect x="200" y="900" width="2000" height="700" fill="#8d6e63"/>
      <text x="300" y="600" font-size="220" font-family="DejaVu Sans" fill="#1b5e20">Fila: 3 personas</text></svg>`) }])
    .jpeg({ quality: 92 }).toFile(photo);

  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=es-CL', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });

  async function phone(label) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 360, height: 720, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${label}] ${m.text()}`); });
    page.on('pageerror', (e) => consoleErrors.push(`[${label}] ${e.message}`));
    page.on('dialog', (d) => { consoleErrors.push(`[${label}] diálogo nativo inesperado: ${d.message()}`); void d.dismiss(); });
    const ph = { ctx, page, label };
    (globalThis.__phones ??= []).push(ph);
    return ph;
  }
  // Abre una pantalla; si ya está en esa ruta, recarga (como volver a abrir la app).
  async function open(p, hash) {
    const cur = await p.page.evaluate(() => location.hash).catch(() => '');
    if (cur === hash) await p.page.reload({ waitUntil: 'networkidle0' });
    else await p.page.goto(`${APP}${hash}`, { waitUntil: 'networkidle0' });
  }
  const shot = (p, name) => p.page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const text = (p) => p.page.evaluate(() => document.body.innerText);
  async function waitText(p, s, timeout = 15000) {
    await p.page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, s);
  }
  async function click(p, sel) { await p.page.waitForSelector(sel, { visible: true }); await p.page.click(sel); }
  async function confirmDialog(p) { await click(p, '.modal [data-r="ok"]'); await p.page.waitForSelector('.modal', { hidden: true }); }
  async function signup(p, name, email) {
    await p.page.goto(APP, { waitUntil: 'networkidle0' });
    await waitText(p, 'Crear cuenta');
    await click(p, 'a[href="#/registro"]');
    await p.page.waitForSelector('#name');
    await p.page.type('#name', name); await p.page.type('#email', email);
    await p.page.type('#pw', 'clave-segura-1'); await p.page.type('#pw2', 'clave-segura-1');
    await p.page.click('#terms');
    await p.page.click('form button[type="submit"]');
    await p.page.waitForFunction(() => location.hash === '#/explorar', { timeout: 15000 });
  }
  async function createRequest(p, title, evidence = 'foto_texto') {
    await open(p, `#/pedir`);
    await p.page.waitForSelector('#title');
    await p.page.type('#title', title);
    await p.page.type('#desc', 'Quiero saber cuántas personas hay en la fila antes de ir.');
    await p.page.select('#cat', 'banco');
    await p.page.click(`input[name="ev"][value="${evidence}"]`);
    await p.page.$eval('#reward', (el) => { el.value = ''; });
    await p.page.type('#reward', '1500');
    await p.page.type('#addr', 'BancoEstado, Pedro de Valdivia 640');
    await p.page.select('#exp', '120');
    return async () => {
      await p.page.click('form button[type="submit"]');
      await p.page.waitForSelector('.modal');
      await confirmDialog(p);
      await p.page.waitForFunction(() => /#\/solicitud\//.test(location.hash), { timeout: 15000 });
      return p.page.evaluate(() => location.hash.split('/').pop());
    };
  }

  const A = await phone('A'); const B = await phone('B'); const C = await phone('C');

  // ---- Bienvenida y registro ----
  await A.page.goto(APP, { waitUntil: 'networkidle0' });
  await waitText(A, 'Información real del lugar');
  await shot(A, '01-bienvenida');
  await A.page.goto(`${APP}#/ingresar`, { waitUntil: 'networkidle0' });
  await A.page.waitForSelector('#email');
  await shot(A, '01b-ingresar');
  await A.page.goto(APP, { waitUntil: 'networkidle0' });
  await waitText(A, 'Información real del lugar');
  // Botón de Google: inicia el flujo OAuth real de Supabase Auth.
  check('Botón "Continuar con Google" visible (proveedor configurado)', (await text(A)).includes('Continuar con Google'));
  const [authReq] = await Promise.all([
    A.page.waitForRequest((r) => r.url().includes('/auth/v1/authorize') && r.url().includes('provider=google'), { timeout: 10000 }),
    A.page.click('[data-action="oauth"][data-provider="google"]'),
  ]);
  check('Google redirige al endpoint OAuth de Supabase', /redirect_to=/.test(authReq.url()), authReq.url().split('?')[0]);
  await A.page.goto(APP, { waitUntil: 'networkidle0' });

  await signup(A, 'Ana', `ana-${Date.now()}@test.cl`);
  await waitText(A, 'No hay solicitudes disponibles');
  check('Registro de A y explorar sin datos ficticios', (await text(A)).includes('No hay solicitudes disponibles'));
  check('Aviso de pagos deshabilitados visible', (await text(A)).includes('Pagos aún no habilitados'));

  // Validación de formulario en el cliente.
  await open(A, `#/pedir`);
  await A.page.waitForSelector('#title');
  await A.page.click('form button[type="submit"]');
  await waitText(A, 'El título debe tener');
  check('Formulario vacío muestra errores por campo', true);

  // ---- 1. A crea una solicitud ----
  const submitA = await createRequest(A, '¿Hay fila en BancoEstado?');
  await shot(A, '02-crear-solicitud');
  const reqId = await submitA();
  await waitText(A, 'Esperando que un colaborador acepte');
  await shot(A, '03-detalle-solicitante');
  check('1. A crea la solicitud', /^[0-9a-f-]{36}$/.test(reqId), reqId);

  // ---- 2-3. B inicia sesión y encuentra la solicitud ----
  await signup(B, 'Benja', `benja-${Date.now()}@test.cl`);
  await waitText(B, '¿Hay fila en BancoEstado?');
  await shot(B, '04-explorar-colaborador');
  check('2-3. B se registra y ve la solicitud real en Explorar', true);
  // Filtros.
  await B.page.click('[data-action="cat"][data-slug="salud"]');
  await waitText(B, 'No hay solicitudes disponibles');
  await B.page.click('[data-action="cat"][data-slug=""]');
  await waitText(B, '¿Hay fila en BancoEstado?');
  await B.page.type('#q', 'farmacia');
  await waitText(B, 'No hay solicitudes disponibles');
  await B.page.$eval('#q', (el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await waitText(B, '¿Hay fila en BancoEstado?');
  check('Filtros por categoría y búsqueda por texto', true);

  // ---- 4. B acepta ----
  await click(B, `a[href="#/solicitud/${reqId}"]`);
  await click(B, '[data-action="accept"]');
  await confirmDialog(B);
  await waitText(B, 'Entregar evidencia');
  check('4. B acepta la solicitud', true);

  // ---- 5. B entrega foto y texto ----
  await B.page.click('[data-action="submit"]');
  await waitText(B, 'requiere al menos una foto');
  check('Validación: sin foto no permite enviar', true);
  check('No hay selector de galería ni de archivos en la entrega', (await B.page.$$('.deliver input[type="file"]')).length === 0);
  await B.ctx.overridePermissions(APP, ['camera']);
  await B.page.click('[data-action="camera"]');
  await B.page.waitForSelector('.camera video');
  await B.page.waitForFunction(() => { const v = document.querySelector('.camera video'); return v && v.videoWidth > 0; }, { timeout: 15000 });
  await shot(B, '05a-camara');
  await B.page.click('.camera [data-c="shot"]');
  await B.page.waitForSelector('.camera', { hidden: true });
  await B.page.waitForFunction(() => document.querySelector('.photo.ok') !== null, { timeout: 20000 });
  check('Foto tomada con la cámara en vivo de la app', true);
  await B.page.type('#ev-text', 'Hay solo 3 personas en la fila y 2 cajas atendiendo.');
  await shot(B, '05-entregar-evidencia');
  await B.page.click('[data-action="submit"]');
  await confirmDialog(B);
  await waitText(B, 'Esperando revisión del solicitante');
  check('5. B entrega fotografía y texto', true);
  const [obj] = (await stack.admin.query(`select name, metadata from storage.objects where name like $1`, [`${reqId}/%`])).rows;
  check('La foto quedó en Storage privado y comprimida', obj && obj.metadata.size < 1_000_000, `${obj?.metadata.size} bytes`);
  {
    // Marca de agua: franja inferior con borde naranja a la izquierda y texto blanco.
    const file = path.join('/tmp/mtigo-e2e/storage', 'evidence', obj.name);
    await sharp(file).toFile(path.join(SHOTS, '05b-foto-con-marca.jpg'));
    const meta = await sharp(file).metadata();
    const size = Math.max(16, Math.round(meta.width / 38));
    const bandH = size * 2 + Math.round(size * 0.6) * 3;
    const region = async (r) => sharp(await sharp(file).extract(r).png().toBuffer()).stats();
    const stripe = await region({ left: 0, top: meta.height - bandH + 4, width: 3, height: bandH - 8 });
    const [r, g, b] = stripe.channels.map((c) => c.mean);
    const text = await region({ left: size, top: meta.height - bandH, width: Math.round(meta.width * 0.6), height: bandH });
    const top = await region({ left: size, top: 0, width: Math.round(meta.width * 0.6), height: bandH });
    const noTextOnTop = top.channels.slice(0, 3).some((c) => c.max < 235);
    const whiteText = text.channels.slice(0, 3).every((c) => c.max >= 235);
    check('La foto tiene la marca de agua (borde naranja y texto)', r > 180 && b < 110 && g > 90 && whiteText && noTextOnTop, `rgb=${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)} textoBlanco=${whiteText}`);
  }

  // ---- 6. A revisa ----
  await open(A, `#/avisos`);
  await waitText(A, 'Evidencia entregada');
  await shot(A, '06-avisos');
  check('Aviso interno "Evidencia entregada" para A', true);
  await open(A, `#/solicitud/${reqId}`);
  await waitText(A, 'Hay solo 3 personas');
  await A.page.waitForFunction(() => [...document.querySelectorAll('.photo img')].some((i) => i.complete && i.naturalWidth > 0), { timeout: 15000 });
  const imgW = await A.page.$eval('.photo img', (i) => i.naturalWidth);
  await shot(A, '07-revisar-evidencia');
  check('6. A ve el texto y la foto (URL firmada)', imgW > 0 && imgW <= 1600, `ancho ${imgW}px`);

  // ---- 7. A aprueba ----
  await click(A, '[data-action="approve"]');
  await confirmDialog(A);
  await waitText(A, 'Aprobada');
  check('7. A aprueba la evidencia', true);

  // ---- 8. Historial para ambos ----
  for (const p of [A, B]) {
    await open(p, `#/solicitud/${reqId}`);
    await waitText(p, 'Historial');
    const t = await text(p);
    const ok = ['Disponible', 'Aceptada', 'En proceso', 'Evidencia entregada', 'Aprobada'].every((s) => t.includes(s));
    check(`8. ${p.label} consulta el historial completo`, ok, ok ? '' : t.slice(t.indexOf('Historial')));
  }
  await shot(A, '08-historial');
  await open(B, `#/actividad`);
  await B.page.click('[data-t="collab"]');
  await waitText(B, '¿Hay fila en BancoEstado?');
  await shot(B, '09-actividad-colaborador');
  check('Historial de colaboraciones de B', true);

  // ---- 9. Persistencia al cerrar y abrir la app ----
  const pageA2 = await A.ctx.newPage();
  await A.page.close();
  await pageA2.setViewport({ width: 360, height: 720, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await pageA2.goto(`${APP}#/actividad`, { waitUntil: 'networkidle0' });
  await pageA2.waitForFunction(() => document.body.innerText.includes('¿Hay fila en BancoEstado?') && document.body.innerText.includes('Aprobada'), { timeout: 15000 });
  A.page = pageA2;
  check('9. Sesión y datos persisten al cerrar y volver a abrir', true);

  // ---- Cuenta social (Google): aceptación explícita de términos ----
  const gEmail = `gabi-${Date.now()}@gmail.com`;
  await fetch(`${stack.url}/auth/v1/signup`, { method: 'POST', headers: { apikey: stack.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: gEmail, password: 'clave-segura-1', data: { full_name: 'Gabriela Soto' } }) });
  const G = await phone('G');
  await G.page.goto(`${APP}#/ingresar`, { waitUntil: 'networkidle0' });
  await G.page.type('#email', gEmail); await G.page.type('#pw', 'clave-segura-1');
  await G.page.click('form button[type="submit"]');
  await waitText(G, 'Antes de comenzar');
  check('Cuenta sin términos aceptados ve la pantalla de aceptación', (await text(G)).includes('¡Hola, Gabriela Soto!'));
  await shot(G, '13-aceptar-terminos');
  await G.page.click('[data-action="accept"]');
  await waitText(G, 'Debes aceptar');
  await G.page.click('#terms');
  await G.page.click('[data-action="accept"]');
  await G.page.waitForFunction(() => location.hash === '#/explorar', { timeout: 10000 });
  check('Tras aceptar términos entra a Explorar', true);
  await G.ctx.close();

  // ---- Usuario no autorizado ----
  await signup(C, 'Carla', `carla-${Date.now()}@test.cl`);
  await open(C, `#/solicitud/${reqId}`);
  await waitText(C, 'no existe o no tienes acceso');
  check('Tercero no puede ver la solicitud ni la evidencia', true);
  const photoPath = obj.name;
  const leaked = await C.page.evaluate(async (url, key, p) => {
    const token = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.includes('auth-token')))).access_token;
    const r = await fetch(`${url}/storage/v1/object/sign/evidence`, { method: 'POST', headers: { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 60, paths: [p] }) });
    return (await r.json())[0].signedURL;
  }, stack.url, stack.anonKey, photoPath);
  check('Tercero no obtiene URL de la foto privada', leaked === null);
  const direct = await C.page.evaluate(async (url, key) => {
    const token = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.includes('auth-token')))).access_token;
    const r = await fetch(`${url}/rest/v1/requests?select=id,status`, { method: 'PATCH', headers: { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ status: 'cancelada' }) });
    return r.status;
  }, stack.url, stack.anonKey);
  check('Escritura directa a la API rechazada (permiso denegado)', direct === 401 || direct === 403, `HTTP ${direct}`);

  // ---- Rechazo con motivo ----
  const submit2 = await createRequest(A, '¿Está abierta la farmacia?', 'texto');
  const req2 = await submit2();
  await open(B, `#/solicitud/${req2}`);
  await click(B, '[data-action="accept"]'); await confirmDialog(B);
  await B.page.waitForSelector('#ev-text');
  await B.page.type('#ev-text', 'No pude ver bien.');
  await B.page.click('[data-action="submit"]'); await confirmDialog(B);
  await waitText(B, 'Esperando revisión');
  await open(A, `#/solicitud/${req2}`);
  await click(A, '[data-action="reject"]');
  await A.page.click('.modal [data-r="ok"]');
  await waitText(A, 'Mínimo 5 caracteres');
  await A.page.type('.modal textarea', 'La respuesta no confirma si está abierta');
  await confirmDialog(A);
  await waitText(A, 'Motivo del rechazo');
  check('Rechazo exige motivo y queda visible', (await text(A)).includes('La respuesta no confirma si está abierta'));
  await open(B, `#/solicitud/${req2}`);
  await waitText(B, 'La respuesta no confirma si está abierta');
  check('El colaborador ve el motivo del rechazo', true);

  // ---- Aceptación simultánea desde dos teléfonos ----
  const submit3 = await createRequest(A, '¿Hay estacionamiento en el supermercado?', 'texto');
  const req3 = await submit3();
  await Promise.all([B, C].map((p) => open(p, `#/solicitud/${req3}`)));
  await Promise.all([B, C].map((p) => p.page.waitForSelector('[data-action="accept"]')));
  await Promise.all([B, C].map((p) => p.page.click('[data-action="accept"]')));
  await Promise.all([B, C].map((p) => p.page.waitForSelector('.modal [data-r="ok"]')));
  await Promise.all([B, C].map((p) => p.page.click('.modal [data-r="ok"]')));
  await new Promise((r) => setTimeout(r, 2500));
  const winners = (await stack.admin.query(`select count(*)::int n from public.request_assignments where request_id = $1`, [req3])).rows[0].n;
  const tB = await text(B); const tC = await text(C);
  const lostMsg = [tB, tC].filter((t) => t.includes('Otro colaborador aceptó')).length;
  const wonUi = [tB, tC].filter((t) => t.includes('Entregar evidencia')).length;
  check('Aceptación simultánea: una sola asignación', winners === 1, `asignaciones=${winners}`);
  check('Aceptación simultánea: un ganador y un aviso al perdedor en la interfaz', wonUi === 1 && lostMsg >= 1, `ganador=${wonUi} avisos=${lostMsg}`);

  // ---- Solicitud vencida ----
  const submit4 = await createRequest(A, 'Solicitud que vencerá pronto', 'texto');
  const req4 = await submit4();
  await stack.admin.query(`update public.requests set created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute' where id = $1`, [req4]);
  await open(B, `#/explorar`);
  await new Promise((r) => setTimeout(r, 800));
  check('Solicitud vencida no aparece en Explorar', !(await text(B)).includes('Solicitud que vencerá pronto'));
  await open(A, `#/solicitud/${req4}`);
  await waitText(A, 'Vencida');
  check('El solicitante la ve como Vencida', true);

  // ---- Perfil, avisos de red y capturas extra ----
  await open(B, `#/perfil`);
  await waitText(B, 'Eliminar mi cuenta');
  await shot(B, '10-perfil');
  // Geolocalización real del navegador (permiso concedido) + mapa.
  await A.ctx.overridePermissions(APP, ['geolocation']);
  await A.page.setGeolocation({ latitude: -39.2795, longitude: -72.2280, accuracy: 15 });
  const submit5 = await createRequest(A, '¿Cuánta gente hay en la costanera?', 'foto');
  await click(A, '[data-action="loc"]');
  await waitText(A, 'Ubicación agregada');
  await A.page.select('#radius', '1000');
  await shot(A, '11-crear-con-ubicacion');
  const req5 = await submit5();
  const [r5] = (await stack.admin.query(`select lat, lng, radius_m from public.requests where id = $1`, [req5])).rows;
  check('Ubicación del dispositivo guardada solo al publicar', Number(r5.lat) === -39.2795 && r5.radius_m === 1000, JSON.stringify(r5));
  await open(B, `#/explorar`);
  await waitText(B, '¿Cuánta gente hay en la costanera?');
  await B.page.click('[data-action="view"][data-v="map"]');
  await B.page.waitForSelector('#map .pin-inner', { timeout: 15000 });
  await shot(B, '12-mapa');
  check('Mapa OpenStreetMap con marcador de la solicitud real', true);
  await B.ctx.overridePermissions(APP, ['geolocation']);
  await B.page.setGeolocation({ latitude: -39.2826, longitude: -72.2272, accuracy: 20 });
  await B.page.click('[data-action="view"][data-v="list"]');
  await B.page.click('[data-action="near"]');
  await waitText(B, 'A menos de 5 km');
  await B.page.waitForFunction(() => /· \d{3} m/.test(document.body.innerText), { timeout: 15000 });
  const distM = await B.page.evaluate(() => /· (\d{3}) m/.exec(document.body.innerText)[1]);
  check('"Cerca de mí" calcula la distancia real', Number(distM) >= 330 && Number(distM) <= 370, `${distM} m`);

  // ---- Eliminación de cuenta ----
  await open(C, `#/perfil`);
  await click(C, '[data-action="delete"]');
  await C.page.type('.modal input', 'ELIMINAR');
  await confirmDialog(C);
  await C.page.waitForFunction(() => location.hash === '#/bienvenida', { timeout: 15000 });
  const left = (await stack.admin.query(`select count(*)::int n from auth.users where raw_user_meta_data->>'display_name' = 'Carla'`)).rows[0].n;
  check('Eliminación de cuenta desde la app borra el usuario', left === 0);

  const relevantErrors = consoleErrors.filter((e) => !/tile\.openstreetmap\.org|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/.test(e));
  check('Sin errores de JavaScript en consola', relevantErrors.length === 0, relevantErrors.join(' | '));
} catch (e) {
  console.error('ERROR:', e.message);
  for (const p of (globalThis.__phones ?? [])) {
    try { console.error(`--- Pantalla ${p.label} (${await p.page.evaluate(() => location.hash)}):\n`, (await p.page.evaluate(() => document.body.innerText)).slice(0, 600)); } catch { /* cerrada */ }
  }
  if (consoleErrors.length) console.error('Consola:', consoleErrors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.close();
  await stack.stop();
  rmSync(path.join(root, 'dist-e2e'), { recursive: true, force: true });
  const ok = results.filter((r) => r.ok).length;
  console.log(`\nResultado E2E: ${ok}/${results.length} verificaciones correctas`);
}
