-- MtiGo! — Agrega Temuco como ciudad activa.
-- Ejecutar en Supabase > SQL Editor. Se puede repetir sin problema.
insert into public.cities (slug, name, region, lat, lng, active)
values ('temuco', 'Temuco', 'La Araucanía', -38.735900, -72.590400, true)
on conflict (slug) do update set active = true;
