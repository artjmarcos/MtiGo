// Enrutador por hash (funciona igual en Android/Capacitor y en GitHub Pages).
export interface Route { name: string; params: Record<string, string> }

const PATTERNS: [string, RegExp, string[]][] = [
  ['welcome', /^\/bienvenida$/, []],
  ['login', /^\/ingresar$/, []],
  ['signup', /^\/registro$/, []],
  ['recover', /^\/recuperar$/, []],
  ['newPassword', /^\/nueva-clave$/, []],
  ['explore', /^\/(explorar)?$/, []],
  ['create', /^\/pedir$/, []],
  ['request', /^\/solicitud\/([0-9a-f-]{36})$/, ['id']],
  ['activity', /^\/actividad$/, []],
  ['notifications', /^\/avisos$/, []],
  ['profile', /^\/perfil$/, []],
  ['legal', /^\/legal\/(privacidad|terminos|eliminar-cuenta)$/, ['doc']],
];

export function parseRoute(hash: string): Route {
  // Los enlaces de Supabase (recuperación) llegan como #access_token=...; no son rutas.
  if (/access_token=|error_description=/.test(hash)) return { name: 'authCallback', params: {} };
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  for (const [name, re, keys] of PATTERNS) {
    const m = re.exec(path);
    if (m) return { name, params: Object.fromEntries(keys.map((k, i) => [k, m[i + 1]])) };
  }
  return { name: 'notFound', params: {} };
}

export function go(path: string, replace = false): void {
  const hash = `#${path}`;
  if (replace || location.hash === hash) {
    if (replace) history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash; // dispara hashchange por sí solo
  }
}
