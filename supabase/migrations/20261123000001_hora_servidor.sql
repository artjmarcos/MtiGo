-- MtiGo! — Hora oficial del servidor para la marca de agua de las fotos.
-- (La hora del teléfono se puede cambiar; la del servidor no.)
create or replace function public.server_time() returns timestamptz
language sql stable as $$ select now() $$;
revoke execute on function public.server_time() from public, anon;
grant execute on function public.server_time() to authenticated;
