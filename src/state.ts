// Estado compartido de la sesión.
import type { Session } from '@supabase/supabase-js';
import type { Category, City, Profile } from './lib/api';

export interface AppState {
  session: Session | null;
  profile: Profile | null;
  phone: string | null;
  categories: Category[];
  cities: City[];
  unread: number;
  activeCount: number;
  /** Ubicación reciente del usuario (solo en memoria, nunca se guarda en el servidor salvo al publicar). */
  lastCoords: { lat: number; lng: number; accuracy: number } | null;
}

export const state: AppState = {
  session: null,
  profile: null,
  phone: null,
  categories: [],
  cities: [],
  unread: 0,
  activeCount: 0,
  lastCoords: null,
};

export function userId(): string {
  const id = state.session?.user.id;
  if (!id) throw new Error('MTIGO_NOT_AUTHENTICATED');
  return id;
}

export function categoryOf(slug: string): Category {
  return state.categories.find((c) => c.slug === slug) ?? { slug, name_es: slug, icon: '📍', sort: 999 };
}

export function cityName(slug: string): string {
  return state.cities.find((c) => c.slug === slug)?.name ?? slug;
}
