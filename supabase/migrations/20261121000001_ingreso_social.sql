-- MtiGo! v0.2 — Ingreso con Google/Facebook.
-- Ejecutar en Supabase > SQL Editor (después de la migración principal).
-- El nombre del perfil se toma del proveedor (full_name / name) cuando no
-- viene display_name. Los términos NO se aceptan automáticamente: la app
-- muestra una pantalla de aceptación explícita.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  v_name := btrim(coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    ''));
  if char_length(v_name) < 2 then
    v_name := left(split_part(coalesce(new.email, 'usuario'), '@', 1), 40);
  end if;
  if char_length(v_name) < 2 then v_name := 'Usuario'; end if;
  insert into public.profiles (id, display_name, accepted_terms_at)
  values (new.id, left(v_name, 40),
          case when (new.raw_user_meta_data ->> 'accepted_terms') = 'true' then now() end)
  on conflict (id) do nothing;
  insert into public.profile_private (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
