import { describe, expect, test, vi } from 'vitest';
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(), close: vi.fn(async () => undefined) } }));
vi.mock('../../src/supabase', () => ({ sb: () => ({ auth: { setSession: vi.fn(async () => ({ error: null })), exchangeCodeForSession: vi.fn(async () => ({ error: null })) } }) }));
import { handleCallbackUrl, NATIVE_CALLBACK, _setPendingForTests } from '../../src/lib/oauth';

describe('ingreso social: vuelta a la app', () => {
  const url = `${NATIVE_CALLBACK}#access_token=AAA&refresh_token=BBB`;
  test('rechaza un enlace de sesión que la app no pidió (inyección de sesión)', async () => {
    _setPendingForTests(0);
    expect(await handleCallbackUrl(url)).toMatch(/no solicitado/);
  });
  test('rechaza un ingreso iniciado hace más de 10 minutos', async () => {
    _setPendingForTests(Date.now() - 11 * 60 * 1000);
    expect(await handleCallbackUrl(url)).toMatch(/no solicitado/);
  });
  test('acepta la vuelta de un ingreso recién iniciado', async () => {
    _setPendingForTests(Date.now());
    expect(await handleCallbackUrl(url)).toBeNull();
  });
  test('ignora otros enlaces', async () => {
    expect(await handleCallbackUrl('https://ejemplo.cl')).toBeNull();
  });
});
