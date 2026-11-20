import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { config } from './config';

// En Android la sesión se guarda con Capacitor Preferences (almacenamiento
// nativo), así sobrevive a cierres de la app aunque el WebView limpie datos.
const nativeStorage = {
  getItem: async (key: string) => (await Preferences.get({ key })).value,
  setItem: async (key: string, value: string) => { await Preferences.set({ key, value }); },
  removeItem: async (key: string) => { await Preferences.remove({ key }); },
};

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
        storage: Capacitor.isNativePlatform() ? nativeStorage : undefined,
      },
    });
  }
  return client;
}
