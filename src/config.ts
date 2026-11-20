// Configuración pública de compilación (archivo .env). La "anon key" de
// Supabase es pública por diseño: la seguridad la dan RLS y las funciones
// del servidor. NUNCA poner aquí la service_role key.
export const config = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  /** URL pública de la versión web (GitHub Pages): recuperación de contraseña y enlaces legales. */
  publicWebUrl: (import.meta.env.VITE_PUBLIC_WEB_URL ?? '').trim(),
  supportEmail: (import.meta.env.VITE_SUPPORT_EMAIL ?? '').trim(),
  defaultCity: 'villarrica',
  defaultCenter: { lat: -39.2826, lng: -72.2272 },
  appVersion: __APP_VERSION__,
};

export function isConfigured(): boolean {
  // HTTPS obligatorio; http solo para un servidor local de desarrollo/pruebas.
  const urlOk = /^https:\/\/.+/.test(config.supabaseUrl) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(config.supabaseUrl);
  return urlOk && config.supabaseAnonKey.length > 20;
}
