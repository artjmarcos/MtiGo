-- =====================================================================
-- MtiGo! — Esquema MVP (piloto Villarrica)
-- Ejecutar completo en Supabase > SQL Editor sobre un proyecto NUEVO.
--
-- Principios:
--  * Toda escritura pasa por funciones de servidor (RPC) que validan.
--    Los clientes NO pueden insertar/actualizar/borrar tablas directamente.
--  * Row Level Security en todas las tablas.
--  * Sin billetera, saldos ni cobros: la recompensa es solo informativa.
--  * Errores de negocio: excepción con mensaje 'MTIGO_<CODIGO>'.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.request_status as enum (
    'disponible', 'aceptada', 'en_proceso', 'evidencia_entregada',
    'aprobada', 'rechazada', 'vencida', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.evidence_type as enum ('foto', 'texto', 'foto_texto');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Catálogos (preparados para expansión e idiomas)
-- ---------------------------------------------------------------------
create table if not exists public.cities (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  region text not null,
  country_code text not null default 'CL' check (country_code ~ '^[A-Z]{2}$'),
  lat numeric(9,6) not null,
  lng numeric(9,6) not null,
  timezone text not null default 'America/Santiago',
  active boolean not null default true
);

insert into public.cities (slug, name, region, lat, lng, active) values
  ('villarrica', 'Villarrica', 'La Araucanía', -39.282600, -72.227200, true),
  ('pucon', 'Pucón', 'La Araucanía', -39.272300, -71.977500, false)
on conflict (slug) do nothing;

create table if not exists public.categories (
  slug text primary key check (slug ~ '^[a-z_]{2,30}$'),
  name_es text not null,
  name_en text not null,
  icon text not null default '📍',
  sort int not null default 100,
  active boolean not null default true
);

insert into public.categories (slug, name_es, name_en, icon, sort) values
  ('comercio', 'Comercio / tienda', 'Shop / store', '🏪', 10),
  ('banco', 'Banco / fila', 'Bank / queue', '🏦', 20),
  ('salud', 'Salud / urgencias', 'Health / ER', '🏥', 30),
  ('tramites', 'Trámites / servicios públicos', 'Public services', '🏛️', 40),
  ('transporte', 'Transporte / tránsito', 'Transport / traffic', '🚌', 50),
  ('gastronomia', 'Restaurantes / cafés', 'Food / cafés', '🍽️', 60),
  ('turismo', 'Turismo / playa / eventos', 'Tourism / events', '🏖️', 70),
  ('otro', 'Otro', 'Other', '❓', 999)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
  city_slug text not null default 'villarrica' references public.cities(slug),
  notify_new_requests boolean not null default true,
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Datos de contacto: solo visibles para el propio usuario.
create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{8,16}$'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Solicitudes
-- ---------------------------------------------------------------------
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id uuid not null,
  title text not null check (char_length(btrim(title)) between 5 and 80),
  description text not null check (char_length(btrim(description)) between 10 and 500),
  category_slug text not null references public.categories(slug),
  evidence_type public.evidence_type not null,
  reward_clp integer not null check (reward_clp between 100 and 50000),
  address text not null check (char_length(btrim(address)) between 3 and 200),
  city_slug text not null references public.cities(slug),
  lat numeric(9,6) check (lat between -90 and 90),
  lng numeric(9,6) check (lng between -180 and 180),
  radius_m integer check (radius_m between 100 and 5000),
  expires_at timestamptz not null,
  status public.request_status not null default 'disponible',
  moderation_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requests_latlng_pair check ((lat is null) = (lng is null)),
  constraint requests_radius_needs_coords check (radius_m is null or lat is not null),
  constraint requests_expiry_after_creation check (expires_at > created_at),
  constraint requests_idempotency unique (requester_id, client_request_id)
);

create index if not exists requests_open_idx on public.requests (city_slug, status, expires_at)
  where status = 'disponible' and moderation_hidden = false;
create index if not exists requests_requester_idx on public.requests (requester_id, created_at desc);
create index if not exists requests_category_idx on public.requests (category_slug);
create index if not exists requests_status_expiry_idx on public.requests (status, expires_at);

-- ---------------------------------------------------------------------
-- Asignaciones (colaborador que aceptó)
-- ---------------------------------------------------------------------
create table if not exists public.request_assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  collaborator_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'activa'
    check (status in ('activa', 'completada', 'rechazada', 'abandonada', 'cancelada', 'vencida')),
  due_at timestamptz not null,
  accepted_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Garantía en base de datos: una sola asignación activa por solicitud.
create unique index if not exists request_assignments_one_active
  on public.request_assignments (request_id) where status = 'activa';
create index if not exists request_assignments_collaborator_idx
  on public.request_assignments (collaborator_id, accepted_at desc);
create index if not exists request_assignments_request_idx
  on public.request_assignments (request_id);

-- ---------------------------------------------------------------------
-- Evidencias
-- ---------------------------------------------------------------------
create table if not exists public.evidence_submissions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  assignment_id uuid not null unique references public.request_assignments(id) on delete cascade,
  collaborator_id uuid not null references public.profiles(id) on delete cascade,
  body_text text check (body_text is null or char_length(body_text) <= 2000),
  status text not null default 'borrador'
    check (status in ('borrador', 'entregada', 'aprobada', 'rechazada')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 5 and 500),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);
create index if not exists evidence_submissions_request_idx on public.evidence_submissions (request_id);
create index if not exists evidence_submissions_collaborator_idx on public.evidence_submissions (collaborator_id);

create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.evidence_submissions(id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  created_at timestamptz not null default now()
);
create index if not exists evidence_files_submission_idx on public.evidence_files (submission_id);

-- ---------------------------------------------------------------------
-- Historial de estados (trazabilidad)
-- ---------------------------------------------------------------------
create table if not exists public.request_status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests(id) on delete cascade,
  from_status public.request_status,
  to_status public.request_status not null,
  actor_id uuid references public.profiles(id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists request_status_history_request_idx
  on public.request_status_history (request_id, created_at);

-- ---------------------------------------------------------------------
-- Mensajes entre solicitante y colaborador (conserva el chat del prototipo)
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_request_idx on public.messages (request_id, created_at);

-- ---------------------------------------------------------------------
-- Notificaciones internas persistentes
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in (
    'nueva_solicitud', 'solicitud_aceptada', 'evidencia_entregada',
    'solicitud_aprobada', 'solicitud_rechazada', 'solicitud_cancelada',
    'solicitud_liberada', 'nuevo_mensaje')),
  request_id uuid references public.requests(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------
-- Moderación: reportes y bloqueos
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  request_id uuid references public.requests(id) on delete cascade,
  submission_id uuid references public.evidence_submissions(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete cascade,
  reason text not null check (reason in (
    'contenido_inapropiado', 'spam', 'acoso', 'fraude', 'datos_personales', 'peligroso', 'otro')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'abierto' check (status in ('abierto', 'revisado', 'descartado')),
  created_at timestamptz not null default now(),
  constraint reports_has_target check (
    request_id is not null or submission_id is not null or reported_user_id is not null)
);
create index if not exists reports_status_idx on public.reports (status, created_at);
create unique index if not exists reports_one_per_reporter_request
  on public.reports (reporter_id, request_id) where request_id is not null and submission_id is null;

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- =====================================================================
-- Funciones auxiliares (internas)
-- =====================================================================

create or replace function public._err(code text) returns void
language plpgsql as $$
begin
  raise exception 'MTIGO_%', code using errcode = 'P0001';
end $$;

create or replace function public._require_user() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then perform public._err('NOT_AUTHENTICATED'); end if;
  if not exists (select 1 from public.profiles where id = uid) then
    perform public._err('PROFILE_REQUIRED');
  end if;
  return uid;
end $$;

create or replace function public._is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

-- Participante = solicitante o colaborador con asignación (cualquiera).
create or replace function public.is_request_participant(p_request_id uuid, p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user is not null and (
    exists (select 1 from public.requests r where r.id = p_request_id and r.requester_id = p_user)
    or exists (select 1 from public.request_assignments a
               where a.request_id = p_request_id and a.collaborator_id = p_user))
$$;

create or replace function public.is_request_owner(p_request_id uuid, p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user is not null and exists (
    select 1 from public.requests r where r.id = p_request_id and r.requester_id = p_user)
$$;

create or replace function public._notify(
  p_user uuid, p_kind text, p_request uuid, p_title text, p_body text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (user_id, kind, request_id, title, body)
  values (p_user, p_kind, p_request, p_title, p_body)
$$;

-- Transiciones permitidas de estado.
create or replace function public._transition_allowed(f public.request_status, t public.request_status)
returns boolean language sql immutable as $$
  select (f, t) in (
    ('disponible'::public.request_status, 'aceptada'::public.request_status),
    ('disponible', 'vencida'),
    ('disponible', 'cancelada'),
    ('aceptada', 'en_proceso'),
    ('aceptada', 'disponible'),          -- colaborador libera la solicitud
    ('aceptada', 'cancelada'),
    ('aceptada', 'vencida'),
    ('en_proceso', 'evidencia_entregada'),
    ('en_proceso', 'disponible'),
    ('en_proceso', 'cancelada'),
    ('en_proceso', 'vencida'),
    ('evidencia_entregada', 'aprobada'),
    ('evidencia_entregada', 'rechazada'))
$$;

create or replace function public._set_status(
  p_request_id uuid, p_to public.request_status, p_actor uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_from public.request_status;
begin
  select status into v_from from public.requests where id = p_request_id for update;
  if v_from is null then perform public._err('NOT_FOUND'); end if;
  if not public._transition_allowed(v_from, p_to) then perform public._err('INVALID_STATE'); end if;
  update public.requests set status = p_to, updated_at = now() where id = p_request_id;
  insert into public.request_status_history (request_id, from_status, to_status, actor_id, note)
  values (p_request_id, v_from, p_to, p_actor, p_note);
end $$;

-- Perfil automático al registrarse.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Historial inicial al crear solicitud.
create or replace function public._request_created_history() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.request_status_history (request_id, from_status, to_status, actor_id, note)
  values (new.id, null, new.status, new.requester_id, 'Solicitud creada');
  return new;
end $$;

drop trigger if exists requests_created_history on public.requests;
create trigger requests_created_history after insert on public.requests
  for each row execute function public._request_created_history();

-- =====================================================================
-- RPC: perfil
-- =====================================================================

create or replace function public.update_my_profile(
  p_display_name text, p_city_slug text, p_phone text, p_notify_new_requests boolean)
returns public.profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); v public.profiles;
begin
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 40 then
    perform public._err('INVALID_NAME'); end if;
  if not exists (select 1 from public.cities where slug = p_city_slug) then
    perform public._err('INVALID_CITY'); end if;
  if p_phone is not null and btrim(p_phone) <> '' and btrim(p_phone) !~ '^\+?[0-9 ]{8,16}$' then
    perform public._err('INVALID_PHONE'); end if;

  update public.profiles
     set display_name = btrim(p_display_name), city_slug = p_city_slug,
         notify_new_requests = coalesce(p_notify_new_requests, true), updated_at = now()
   where id = uid returning * into v;
  insert into public.profile_private (user_id, phone, updated_at)
  values (uid, nullif(btrim(coalesce(p_phone, '')), ''), now())
  on conflict (user_id) do update set phone = excluded.phone, updated_at = now();
  return v;
end $$;

create or replace function public.accept_terms() returns public.profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); v public.profiles;
begin
  update public.profiles set accepted_terms_at = coalesce(accepted_terms_at, now()), updated_at = now()
   where id = uid returning * into v;
  return v;
end $$;

-- =====================================================================
-- RPC: crear y cancelar solicitudes
-- =====================================================================

create or replace function public.create_request(
  p_client_request_id uuid,
  p_title text,
  p_description text,
  p_category_slug text,
  p_evidence_type public.evidence_type,
  p_reward_clp integer,
  p_address text,
  p_city_slug text,
  p_expires_at timestamptz,
  p_lat numeric default null,
  p_lng numeric default null,
  p_radius_m integer default null)
returns public.requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := public._require_user();
  v public.requests;
  v_active int;
  v_recent int;
  v_city_name text;
  v_count int := 0;
  r record;
begin
  if p_client_request_id is null then perform public._err('INVALID_CLIENT_ID'); end if;

  -- Idempotencia: el mismo envío repetido devuelve la misma solicitud.
  select * into v from public.requests
   where requester_id = uid and client_request_id = p_client_request_id;
  if found then return v; end if;

  if (select accepted_terms_at from public.profiles where id = uid) is null then
    perform public._err('TERMS_REQUIRED'); end if;
  if p_title is null or char_length(btrim(p_title)) not between 5 and 80 then
    perform public._err('INVALID_TITLE'); end if;
  if p_description is null or char_length(btrim(p_description)) not between 10 and 500 then
    perform public._err('INVALID_DESCRIPTION'); end if;
  if not exists (select 1 from public.categories where slug = p_category_slug and active) then
    perform public._err('INVALID_CATEGORY'); end if;
  if p_evidence_type is null then perform public._err('INVALID_EVIDENCE_TYPE'); end if;
  if p_reward_clp is null or p_reward_clp not between 100 and 50000 then
    perform public._err('INVALID_REWARD'); end if;
  if p_address is null or char_length(btrim(p_address)) not between 3 and 200 then
    perform public._err('INVALID_ADDRESS'); end if;
  select name into v_city_name from public.cities where slug = p_city_slug and active;
  if v_city_name is null then perform public._err('INVALID_CITY'); end if;
  if p_expires_at is null
     or p_expires_at < now() + interval '10 minutes'
     or p_expires_at > now() + interval '72 hours' then
    perform public._err('INVALID_EXPIRY'); end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    perform public._err('INVALID_LOCATION'); end if;
  if p_radius_m is not null and (p_lat is null or p_radius_m not between 100 and 5000) then
    perform public._err('INVALID_RADIUS'); end if;

  select count(*) into v_active from public.requests
   where requester_id = uid
     and status in ('disponible', 'aceptada', 'en_proceso', 'evidencia_entregada')
     and not (status = 'disponible' and expires_at <= now());
  if v_active >= 5 then perform public._err('TOO_MANY_ACTIVE'); end if;

  select count(*) into v_recent from public.requests
   where requester_id = uid and created_at > now() - interval '24 hours';
  if v_recent >= 20 then perform public._err('RATE_LIMIT'); end if;

  insert into public.requests (
    requester_id, client_request_id, title, description, category_slug, evidence_type,
    reward_clp, address, city_slug, lat, lng, radius_m, expires_at)
  values (
    uid, p_client_request_id, btrim(p_title), btrim(p_description), p_category_slug, p_evidence_type,
    p_reward_clp, btrim(p_address), p_city_slug, p_lat, p_lng, p_radius_m, p_expires_at)
  returning * into v;

  -- Aviso interno a usuarios de la misma ciudad (máx. 200 en el piloto).
  for r in
    select p.id from public.profiles p
     where p.city_slug = p_city_slug and p.notify_new_requests and p.id <> uid
       and not public._is_blocked_between(uid, p.id)
     order by p.created_at desc limit 200
  loop
    perform public._notify(r.id, 'nueva_solicitud', v.id,
      'Nueva solicitud en ' || v_city_name, v.title);
    v_count := v_count + 1;
  end loop;

  return v;
end $$;

create or replace function public.cancel_request(p_request_id uuid, p_reason text default null)
returns public.requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); v public.requests; a public.request_assignments;
begin
  select * into v from public.requests where id = p_request_id for update;
  if not found then perform public._err('NOT_FOUND'); end if;
  if v.requester_id <> uid then perform public._err('NOT_ALLOWED'); end if;
  if v.status not in ('disponible', 'aceptada', 'en_proceso') then perform public._err('INVALID_STATE'); end if;

  perform public._set_status(p_request_id, 'cancelada', uid, left(nullif(btrim(coalesce(p_reason, '')), ''), 500));

  update public.request_assignments set status = 'cancelada', finished_at = now()
   where request_id = p_request_id and status = 'activa' returning * into a;
  if a.id is not null then
    perform public._notify(a.collaborator_id, 'solicitud_cancelada', p_request_id,
      'Solicitud cancelada', 'El solicitante canceló: ' || v.title);
  end if;

  select * into v from public.requests where id = p_request_id;
  return v;
end $$;

-- =====================================================================
-- RPC: aceptación ATÓMICA
-- La fila de la solicitud se bloquea (FOR UPDATE) y además existe un índice
-- único parcial: dos colaboradores nunca pueden obtener la misma solicitud.
-- =====================================================================

create or replace function public.accept_request(p_request_id uuid)
returns public.request_assignments
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); v public.requests; a public.request_assignments;
        v_name text;
begin
  select * into v from public.requests where id = p_request_id for update;
  if not found or v.moderation_hidden then perform public._err('NOT_FOUND'); end if;
  if v.requester_id = uid then perform public._err('OWN_REQUEST'); end if;
  if (select accepted_terms_at from public.profiles where id = uid) is null then
    perform public._err('TERMS_REQUIRED'); end if;
  if public._is_blocked_between(uid, v.requester_id) then perform public._err('BLOCKED'); end if;
  if v.status <> 'disponible' then perform public._err('ALREADY_TAKEN'); end if;
  if v.expires_at <= now() then perform public._err('EXPIRED'); end if;
  if (select count(*) from public.request_assignments
       where collaborator_id = uid and status = 'activa') >= 3 then
    perform public._err('TOO_MANY_ACTIVE'); end if;

  perform public._set_status(p_request_id, 'aceptada', uid, null);

  insert into public.request_assignments (request_id, collaborator_id, due_at)
  values (p_request_id, uid, greatest(v.expires_at, now() + interval '20 minutes'))
  returning * into a;

  select display_name into v_name from public.profiles where id = uid;
  perform public._notify(v.requester_id, 'solicitud_aceptada', p_request_id,
    'Solicitud aceptada', v_name || ' aceptó: ' || v.title);
  return a;
end $$;

-- El colaborador libera la solicitud (vuelve a estar disponible si no venció).
create or replace function public.release_request(p_request_id uuid)
returns public.requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); v public.requests; a public.request_assignments;
begin
  select * into v from public.requests where id = p_request_id for update;
  if not found then perform public._err('NOT_FOUND'); end if;
  select * into a from public.request_assignments
   where request_id = p_request_id and status = 'activa' and collaborator_id = uid;
  if not found then perform public._err('NOT_ALLOWED'); end if;
  if v.status not in ('aceptada', 'en_proceso') then perform public._err('INVALID_STATE'); end if;

  update public.request_assignments set status = 'abandonada', finished_at = now() where id = a.id;
  delete from public.evidence_submissions where assignment_id = a.id and status = 'borrador';

  if v.expires_at > now() then
    perform public._set_status(p_request_id, 'disponible', uid, 'El colaborador liberó la solicitud');
  else
    perform public._set_status(p_request_id, 'vencida', uid, 'Liberada después del vencimiento');
  end if;
  perform public._notify(v.requester_id, 'solicitud_liberada', p_request_id,
    'Colaborador liberó tu solicitud', v.title);
  select * into v from public.requests where id = p_request_id;
  return v;
end $$;

-- =====================================================================
-- RPC: evidencias
-- Flujo: start_submission -> subir fotos a Storage -> add_evidence_file
--        -> submit_evidence
-- Ruta en Storage: evidence/<request_id>/<submission_id>/<archivo>
-- =====================================================================

create or replace function public.start_submission(p_request_id uuid)
returns public.evidence_submissions
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); v public.requests; a public.request_assignments;
        s public.evidence_submissions;
begin
  select * into v from public.requests where id = p_request_id for update;
  if not found then perform public._err('NOT_FOUND'); end if;
  select * into a from public.request_assignments
   where request_id = p_request_id and status = 'activa' and collaborator_id = uid;
  if not found then perform public._err('NOT_ALLOWED'); end if;
  if a.due_at <= now() then perform public._err('EXPIRED'); end if;

  select * into s from public.evidence_submissions where assignment_id = a.id;
  if found then
    if s.status <> 'borrador' then perform public._err('INVALID_STATE'); end if;
    return s;
  end if;

  if v.status = 'aceptada' then
    perform public._set_status(p_request_id, 'en_proceso', uid, null);
  elsif v.status <> 'en_proceso' then
    perform public._err('INVALID_STATE');
  end if;

  insert into public.evidence_submissions (request_id, assignment_id, collaborator_id)
  values (p_request_id, a.id, uid) returning * into s;
  return s;
end $$;

-- ¿Puede el usuario actual subir a esta ruta? (usado por la política de Storage)
create or replace function public.can_upload_evidence(p_path text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare parts text[] := string_to_array(p_path, '/'); v_req uuid; v_sub uuid;
begin
  if auth.uid() is null or array_length(parts, 1) <> 3 then return false; end if;
  if parts[3] !~ '^[A-Za-z0-9_-]{8,80}\.(jpg|jpeg|png|webp)$' then return false; end if;
  begin
    v_req := parts[1]::uuid; v_sub := parts[2]::uuid;
  exception when others then return false; end;
  return exists (
    select 1 from public.evidence_submissions s
      join public.request_assignments a on a.id = s.assignment_id
     where s.id = v_sub and s.request_id = v_req and s.status = 'borrador'
       and s.collaborator_id = auth.uid() and a.status = 'activa' and a.due_at > now());
end $$;

-- ¿Puede el usuario actual ver este archivo?
create or replace function public.can_read_evidence(p_path text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare parts text[] := string_to_array(p_path, '/'); v_req uuid; v_sub uuid;
begin
  if auth.uid() is null or array_length(parts, 1) <> 3 then return false; end if;
  begin
    v_req := parts[1]::uuid; v_sub := parts[2]::uuid;
  exception when others then return false; end;
  return exists (
    select 1 from public.evidence_submissions s
      join public.requests r on r.id = s.request_id
     where s.id = v_sub and s.request_id = v_req
       and (s.collaborator_id = auth.uid()
            or (r.requester_id = auth.uid() and s.status <> 'borrador')));
end $$;

-- ¿Puede borrar? Colaborador (su borrador) o participantes al eliminar su cuenta.
create or replace function public.can_delete_evidence(p_path text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare parts text[] := string_to_array(p_path, '/'); v_req uuid;
begin
  if auth.uid() is null or array_length(parts, 1) <> 3 then return false; end if;
  begin v_req := parts[1]::uuid; exception when others then return false; end;
  return public.is_request_participant(v_req, auth.uid());
end $$;

create or replace function public.add_evidence_file(
  p_submission_id uuid, p_storage_path text, p_mime_type text, p_size_bytes integer)
returns public.evidence_files
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); s public.evidence_submissions; f public.evidence_files;
begin
  select * into s from public.evidence_submissions where id = p_submission_id for update;
  if not found then perform public._err('NOT_FOUND'); end if;
  if s.collaborator_id <> uid then perform public._err('NOT_ALLOWED'); end if;
  if s.status <> 'borrador' then perform public._err('INVALID_STATE'); end if;
  if split_part(p_storage_path, '/', 1) <> s.request_id::text
     or split_part(p_storage_path, '/', 2) <> s.id::text
     or not public.can_upload_evidence(p_storage_path) then
    perform public._err('INVALID_PATH'); end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then perform public._err('INVALID_FILE_TYPE'); end if;
  if p_size_bytes is null or p_size_bytes not between 1 and 5242880 then perform public._err('INVALID_FILE_SIZE'); end if;
  if (select count(*) from public.evidence_files where submission_id = s.id) >= 4 then
    perform public._err('TOO_MANY_FILES'); end if;
  -- El archivo debe existir realmente en Storage: no se aceptan subidas simuladas.
  if not exists (select 1 from storage.objects where bucket_id = 'evidence' and name = p_storage_path) then
    perform public._err('FILE_NOT_UPLOADED'); end if;

  insert into public.evidence_files (submission_id, storage_path, mime_type, size_bytes)
  values (s.id, p_storage_path, p_mime_type, p_size_bytes)
  on conflict (storage_path) do nothing
  returning * into f;
  if f.id is null then select * into f from public.evidence_files where storage_path = p_storage_path; end if;
  return f;
end $$;

-- Quitar una foto del borrador (antes de entregar). La app borra también el
-- objeto en Storage.
create or replace function public.remove_evidence_file(p_file_id uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); f public.evidence_files; s public.evidence_submissions;
begin
  select * into f from public.evidence_files where id = p_file_id;
  if not found then perform public._err('NOT_FOUND'); end if;
  select * into s from public.evidence_submissions where id = f.submission_id for update;
  if s.collaborator_id <> uid then perform public._err('NOT_ALLOWED'); end if;
  if s.status <> 'borrador' then perform public._err('INVALID_STATE'); end if;
  delete from public.evidence_files where id = f.id;
  return f.storage_path;
end $$;

create or replace function public.submit_evidence(p_submission_id uuid, p_body_text text)
returns public.evidence_submissions
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); s public.evidence_submissions; v public.requests;
        a public.request_assignments; v_files int; v_text text := nullif(btrim(coalesce(p_body_text, '')), '');
        v_name text;
begin
  select * into s from public.evidence_submissions where id = p_submission_id for update;
  if not found then perform public._err('NOT_FOUND'); end if;
  if s.collaborator_id <> uid then perform public._err('NOT_ALLOWED'); end if;
  if s.status <> 'borrador' then perform public._err('INVALID_STATE'); end if;
  select * into a from public.request_assignments where id = s.assignment_id;
  if a.status <> 'activa' then perform public._err('NOT_ALLOWED'); end if;
  if a.due_at <= now() then perform public._err('EXPIRED'); end if;
  select * into v from public.requests where id = s.request_id for update;
  if v.status <> 'en_proceso' then perform public._err('INVALID_STATE'); end if;

  select count(*) into v_files from public.evidence_files where submission_id = s.id;
  if v.evidence_type in ('foto', 'foto_texto') and v_files = 0 then perform public._err('EVIDENCE_PHOTO_REQUIRED'); end if;
  if v.evidence_type in ('texto', 'foto_texto') and (v_text is null or char_length(v_text) < 3) then
    perform public._err('EVIDENCE_TEXT_REQUIRED'); end if;
  if v_text is not null and char_length(v_text) > 2000 then perform public._err('INVALID_TEXT'); end if;

  update public.evidence_submissions
     set body_text = v_text, status = 'entregada', submitted_at = now()
   where id = s.id returning * into s;
  perform public._set_status(v.id, 'evidencia_entregada', uid, null);

  select display_name into v_name from public.profiles where id = uid;
  perform public._notify(v.requester_id, 'evidencia_entregada', v.id,
    'Evidencia entregada', v_name || ' respondió: ' || v.title);
  return s;
end $$;

create or replace function public.review_evidence(p_request_id uuid, p_approve boolean, p_reason text default null)
returns public.evidence_submissions
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); v public.requests; s public.evidence_submissions;
        v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into v from public.requests where id = p_request_id for update;
  if not found then perform public._err('NOT_FOUND'); end if;
  -- Solo el solicitante revisa; el colaborador jamás puede aprobar su propia entrega.
  if v.requester_id <> uid then perform public._err('NOT_ALLOWED'); end if;
  if v.status <> 'evidencia_entregada' then perform public._err('INVALID_STATE'); end if;
  if p_approve is null then perform public._err('INVALID_DECISION'); end if;

  select s2.* into s from public.evidence_submissions s2
    join public.request_assignments a on a.id = s2.assignment_id
   where s2.request_id = p_request_id and s2.status = 'entregada' and a.status = 'activa'
   for update of s2;
  if not found then perform public._err('NOT_FOUND'); end if;
  if s.collaborator_id = uid then perform public._err('NOT_ALLOWED'); end if;

  if p_approve then
    update public.evidence_submissions set status = 'aprobada', reviewed_at = now()
     where id = s.id returning * into s;
    update public.request_assignments set status = 'completada', finished_at = now() where id = s.assignment_id;
    perform public._set_status(p_request_id, 'aprobada', uid, null);
    perform public._notify(s.collaborator_id, 'solicitud_aprobada', p_request_id,
      '¡Evidencia aprobada!', v.title);
  else
    if v_reason is null or char_length(v_reason) not between 5 and 500 then
      perform public._err('REASON_REQUIRED'); end if;
    update public.evidence_submissions set status = 'rechazada', rejection_reason = v_reason, reviewed_at = now()
     where id = s.id returning * into s;
    update public.request_assignments set status = 'rechazada', finished_at = now() where id = s.assignment_id;
    perform public._set_status(p_request_id, 'rechazada', uid, v_reason);
    perform public._notify(s.collaborator_id, 'solicitud_rechazada', p_request_id,
      'Evidencia rechazada', v.title || ' — Motivo: ' || v_reason);
  end if;
  return s;
end $$;

-- =====================================================================
-- RPC: mensajes, avisos, reportes, bloqueos
-- =====================================================================

create or replace function public.send_message(p_request_id uuid, p_body text)
returns public.messages
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); v public.requests; a public.request_assignments;
        m public.messages; v_other uuid;
begin
  select * into v from public.requests where id = p_request_id;
  if not found then perform public._err('NOT_FOUND'); end if;
  select * into a from public.request_assignments
   where request_id = p_request_id and status in ('activa', 'completada', 'rechazada')
   order by accepted_at desc limit 1;
  if a.id is null or uid not in (v.requester_id, a.collaborator_id) then perform public._err('NOT_ALLOWED'); end if;
  if public._is_blocked_between(v.requester_id, a.collaborator_id) then perform public._err('BLOCKED'); end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 1000 then perform public._err('INVALID_MESSAGE'); end if;
  if (select count(*) from public.messages where sender_id = uid and created_at > now() - interval '1 minute') >= 15 then
    perform public._err('RATE_LIMIT'); end if;

  insert into public.messages (request_id, sender_id, body) values (p_request_id, uid, btrim(p_body)) returning * into m;
  v_other := case when uid = v.requester_id then a.collaborator_id else v.requester_id end;
  if not exists (select 1 from public.notifications where user_id = v_other and request_id = p_request_id
                  and kind = 'nuevo_mensaje' and read_at is null) then
    perform public._notify(v_other, 'nuevo_mensaje', p_request_id, 'Nuevo mensaje', v.title);
  end if;
  return m;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); n int;
begin
  update public.notifications set read_at = now()
   where user_id = uid and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.report_content(
  p_reason text, p_details text default null, p_request_id uuid default null,
  p_submission_id uuid default null, p_reported_user_id uuid default null)
returns public.reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user(); rep public.reports; v_reporters int;
begin
  if p_request_id is null and p_submission_id is null and p_reported_user_id is null then
    perform public._err('INVALID_TARGET'); end if;
  if p_reported_user_id = uid then perform public._err('INVALID_TARGET'); end if;
  if p_request_id is not null and not exists (select 1 from public.requests where id = p_request_id) then
    perform public._err('NOT_FOUND'); end if;
  if p_submission_id is not null and not exists (
       select 1 from public.evidence_submissions s join public.requests r on r.id = s.request_id
        where s.id = p_submission_id and uid in (r.requester_id, s.collaborator_id)) then
    perform public._err('NOT_FOUND'); end if;
  if (select count(*) from public.reports where reporter_id = uid and created_at > now() - interval '24 hours') >= 20 then
    perform public._err('RATE_LIMIT'); end if;

  insert into public.reports (reporter_id, request_id, submission_id, reported_user_id, reason, details)
  values (uid, p_request_id, p_submission_id, p_reported_user_id, p_reason, left(nullif(btrim(coalesce(p_details, '')), ''), 1000))
  on conflict do nothing
  returning * into rep;
  if rep.id is null then
    select * into rep from public.reports where reporter_id = uid and request_id = p_request_id and submission_id is null;
  end if;

  -- Moderación automática básica: 3 reportes distintos ocultan la solicitud
  -- hasta que un administrador la revise.
  if p_request_id is not null then
    select count(distinct reporter_id) into v_reporters from public.reports
     where request_id = p_request_id and status = 'abierto';
    if v_reporters >= 3 then
      update public.requests set moderation_hidden = true, updated_at = now() where id = p_request_id;
    end if;
  end if;
  return rep;
end $$;

create or replace function public.block_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user();
begin
  if p_user_id is null or p_user_id = uid or not exists (select 1 from public.profiles where id = p_user_id) then
    perform public._err('INVALID_TARGET'); end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (uid, p_user_id) on conflict do nothing;
end $$;

create or replace function public.unblock_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user();
begin
  delete from public.user_blocks where blocker_id = uid and blocked_id = p_user_id;
end $$;

-- =====================================================================
-- Vencimiento (llamado por pg_cron y también de forma perezosa por la app)
-- =====================================================================

create or replace function public.expire_overdue_requests()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  for r in
    select id from public.requests where status = 'disponible' and expires_at <= now()
    for update skip locked
  loop
    perform public._set_status(r.id, 'vencida', null, 'Venció sin ser aceptada');
    n := n + 1;
  end loop;

  for r in
    select a.id as assignment_id, a.request_id, rq.requester_id, a.collaborator_id, rq.title
      from public.request_assignments a join public.requests rq on rq.id = a.request_id
     where a.status = 'activa' and a.due_at <= now() and rq.status in ('aceptada', 'en_proceso')
     for update of rq skip locked
  loop
    update public.request_assignments set status = 'vencida', finished_at = now() where id = r.assignment_id;
    perform public._set_status(r.request_id, 'vencida', null, 'El colaborador no entregó a tiempo');
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================
-- Consultas (respetan RLS: security invoker)
-- =====================================================================

create or replace function public.list_available_requests(
  p_city_slug text default 'villarrica',
  p_category_slug text default null,
  p_min_reward integer default null,
  p_max_reward integer default null,
  p_search text default null,
  p_lat numeric default null,
  p_lng numeric default null,
  p_radius_km numeric default null,
  p_limit integer default 50,
  p_offset integer default 0)
returns table (
  id uuid, title text, description text, category_slug text, evidence_type public.evidence_type,
  reward_clp integer, address text, city_slug text, lat numeric, lng numeric, radius_m integer,
  expires_at timestamptz, status public.request_status, created_at timestamptz,
  requester_id uuid, requester_name text, distance_m integer)
language sql stable security invoker set search_path = public, pg_temp as $$
  with base as (
    select r.*, p.display_name as requester_name,
      case when p_lat is not null and p_lng is not null and r.lat is not null then
        (6371000 * 2 * asin(sqrt(
          power(sin(radians((r.lat - p_lat) / 2)), 2) +
          cos(radians(p_lat)) * cos(radians(r.lat)) *
          power(sin(radians((r.lng - p_lng) / 2)), 2))))::integer
      end as dist
    from public.requests r
    join public.profiles p on p.id = r.requester_id
    where r.status = 'disponible' and r.expires_at > now() and not r.moderation_hidden
      and r.requester_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
      and (p_city_slug is null or r.city_slug = p_city_slug)
      and (p_category_slug is null or r.category_slug = p_category_slug)
      and (p_min_reward is null or r.reward_clp >= p_min_reward)
      and (p_max_reward is null or r.reward_clp <= p_max_reward)
      and (p_search is null or btrim(p_search) = '' or
           (r.title || ' ' || r.description || ' ' || r.address) ilike '%' || btrim(p_search) || '%')
  )
  select id, title, description, category_slug, evidence_type, reward_clp, address, city_slug,
         lat, lng, radius_m, expires_at, status, created_at, requester_id, requester_name, dist
    from base
   where p_radius_km is null or dist is null or dist <= p_radius_km * 1000
   order by (dist is null), dist, expires_at
   limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Rutas de Storage a borrar antes de eliminar la cuenta.
create or replace function public.my_evidence_paths()
returns setof text
language sql stable security definer set search_path = public, pg_temp as $$
  select f.storage_path from public.evidence_files f
    join public.evidence_submissions s on s.id = f.submission_id
    join public.requests r on r.id = s.request_id
   where auth.uid() is not null and (s.collaborator_id = auth.uid() or r.requester_id = auth.uid())
$$;

-- Eliminación de cuenta y datos (requisito de Google Play).
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); r record;
begin
  if uid is null then perform public._err('NOT_AUTHENTICATED'); end if;
  -- Libera asignaciones activas en solicitudes de otros usuarios (con historial).
  for r in
    select a.id as assignment_id, a.request_id, rq.expires_at
      from public.request_assignments a join public.requests rq on rq.id = a.request_id
     where a.collaborator_id = uid and a.status = 'activa' and rq.status in ('aceptada', 'en_proceso')
  loop
    update public.request_assignments set status = 'abandonada', finished_at = now() where id = r.assignment_id;
    perform public._set_status(r.request_id,
      case when r.expires_at > now() then 'disponible'::public.request_status else 'vencida'::public.request_status end,
      null, 'El colaborador eliminó su cuenta');
  end loop;
  -- Borra el usuario: todo lo demás se elimina en cascada.
  delete from auth.users where id = uid;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.cities enable row level security;
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.requests enable row level security;
alter table public.request_assignments enable row level security;
alter table public.evidence_submissions enable row level security;
alter table public.evidence_files enable row level security;
alter table public.request_status_history enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.user_blocks enable row level security;

-- Nadie escribe tablas directamente desde el cliente: solo mediante RPC.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.cities, public.categories to anon, authenticated;
grant select on public.profiles, public.profile_private, public.requests, public.request_assignments,
  public.evidence_submissions, public.evidence_files, public.request_status_history,
  public.messages, public.notifications, public.reports, public.user_blocks to authenticated;

drop policy if exists cities_read on public.cities;
create policy cities_read on public.cities for select to anon, authenticated using (true);

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to anon, authenticated using (true);

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);

drop policy if exists profile_private_own on public.profile_private;
create policy profile_private_own on public.profile_private for select to authenticated
  using (user_id = auth.uid());

drop policy if exists requests_read on public.requests;
create policy requests_read on public.requests for select to authenticated using (
  requester_id = auth.uid()
  or public.is_request_participant(id, auth.uid())
  or (status = 'disponible' and not moderation_hidden
      and not public._is_blocked_between(auth.uid(), requester_id))
);

drop policy if exists assignments_read on public.request_assignments;
create policy assignments_read on public.request_assignments for select to authenticated using (
  collaborator_id = auth.uid()
  or public.is_request_owner(request_id, auth.uid())
);

drop policy if exists submissions_read on public.evidence_submissions;
create policy submissions_read on public.evidence_submissions for select to authenticated using (
  collaborator_id = auth.uid()
  or (status <> 'borrador' and public.is_request_owner(request_id, auth.uid()))
);

drop policy if exists files_read on public.evidence_files;
create policy files_read on public.evidence_files for select to authenticated using (
  exists (select 1 from public.evidence_submissions s
          where s.id = submission_id
            and (s.collaborator_id = auth.uid()
                 or (s.status <> 'borrador' and public.is_request_owner(s.request_id, auth.uid()))))
);

drop policy if exists history_read on public.request_status_history;
create policy history_read on public.request_status_history for select to authenticated
  using (public.is_request_participant(request_id, auth.uid()));

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (public.is_request_participant(request_id, auth.uid()));

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists reports_own on public.reports;
create policy reports_own on public.reports for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists blocks_own on public.user_blocks;
create policy blocks_own on public.user_blocks for select to authenticated
  using (blocker_id = auth.uid());

-- =====================================================================
-- Permisos de ejecución de funciones
-- =====================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.update_my_profile(text, text, text, boolean),
  public.accept_terms(),
  public.create_request(uuid, text, text, text, public.evidence_type, integer, text, text, timestamptz, numeric, numeric, integer),
  public.cancel_request(uuid, text),
  public.accept_request(uuid),
  public.release_request(uuid),
  public.start_submission(uuid),
  public.add_evidence_file(uuid, text, text, integer),
  public.remove_evidence_file(uuid),
  public.submit_evidence(uuid, text),
  public.review_evidence(uuid, boolean, text),
  public.send_message(uuid, text),
  public.mark_notifications_read(uuid[]),
  public.report_content(text, text, uuid, uuid, uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.expire_overdue_requests(),
  public.list_available_requests(text, text, integer, integer, text, numeric, numeric, numeric, integer, integer),
  public.my_evidence_paths(),
  public.delete_my_account(),
  -- usadas dentro de políticas RLS / Storage
  public.is_request_participant(uuid, uuid),
  public.is_request_owner(uuid, uuid),
  public._is_blocked_between(uuid, uuid),
  public.can_upload_evidence(text),
  public.can_read_evidence(text),
  public.can_delete_evidence(text)
to authenticated;

-- =====================================================================
-- Storage privado para fotografías
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mtigo evidence insert" on storage.objects;
create policy "mtigo evidence insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and public.can_upload_evidence(name));

drop policy if exists "mtigo evidence read" on storage.objects;
create policy "mtigo evidence read" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.can_read_evidence(name));

drop policy if exists "mtigo evidence delete" on storage.objects;
create policy "mtigo evidence delete" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and public.can_delete_evidence(name));
