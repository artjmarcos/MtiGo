// Ingreso con Google / Facebook mediante Supabase Auth.
// Web: redirección normal. Android: se abre una pestaña segura del sistema
// (Custom Tabs) y Supabase vuelve a la app por el enlace
// io.artjmarcos.mtigo://login-callback (declarado en AndroidManifest.xml).
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { sb } from '../supabase';
import { config } from '../config';

export type OAuthProvider = 'google' | 'facebook';
export const NATIVE_CALLBACK = 'io.artjmarcos.mtigo://login-callback';

export const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: 'Continuar con Google',
  facebook: 'Continuar con Facebook',
};

/** Proveedores habilitados en esta compilación (VITE_AUTH_PROVIDERS=google,facebook). */
export function enabledProviders(): OAuthProvider[] {
  return config.authProviders.filter((p): p is OAuthProvider => p === 'google' || p === 'facebook');
}

// Protección contra "inyección de sesión": solo se acepta una vuelta de
// login-callback si esta app inició el ingreso hace poco.
let pendingSince = 0;
const PENDING_MS = 10 * 60 * 1000;
export function _setPendingForTests(ts: number): void { pendingSince = ts; }

export async function signInWith(provider: OAuthProvider): Promise<void> {
  const native = Capacitor.isNativePlatform();
  pendingSince = Date.now();
  const webReturn = config.publicWebUrl || `${location.origin}${location.pathname}`;
  const { data, error } = await sb().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: native ? NATIVE_CALLBACK : webReturn,
      skipBrowserRedirect: native,
      scopes: provider === 'facebook' ? 'email public_profile' : undefined,
    },
  });
  if (error) throw error;
  if (native && data.url) await Browser.open({ url: data.url, windowName: '_self' });
}

/** Procesa la vuelta a la app (Android). Devuelve un mensaje de error o null. */
export async function handleCallbackUrl(url: string): Promise<string | null> {
  if (!url.startsWith(NATIVE_CALLBACK)) return null;
  await Browser.close().catch(() => undefined);
  const expected = pendingSince > 0 && Date.now() - pendingSince < PENDING_MS;
  pendingSince = 0;
  if (!expected) return 'Enlace de ingreso no solicitado. Vuelve a tocar "Continuar con Google".';
  const u = new URL(url.replace(NATIVE_CALLBACK, 'https://callback.local/'));
  const params = new URLSearchParams(u.hash.replace(/^#/, ''));
  u.searchParams.forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  const err = params.get('error_description') ?? params.get('error');
  if (err) return err.replace(/\+/g, ' ');
  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (access && refresh) {
    const { error } = await sb().auth.setSession({ access_token: access, refresh_token: refresh });
    return error ? error.message : null;
  }
  const code = params.get('code');
  if (code) {
    const { error } = await sb().auth.exchangeCodeForSession(code);
    return error ? error.message : null;
  }
  return 'No se recibió la sesión.';
}
