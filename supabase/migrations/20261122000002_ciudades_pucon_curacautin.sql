-- MtiGo! — Activa Pucón y agrega Curacautín.
-- Ejecutar en Supabase > SQL Editor. Se puede repetir sin problema.
insert into public.cities (slug, name, region, lat, lng, active) values
  ('pucon', 'Pucón', 'La Araucanía', -39.272300, -71.977500, true),
  ('curacautin', 'Curacautín', 'La Araucanía', -38.433300, -71.883300, true)
on conflict (slug) do update set active = true;
