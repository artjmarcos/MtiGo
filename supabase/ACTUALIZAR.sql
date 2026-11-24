-- MtiGo! — TODO lo pendiente en un solo paso (24-11-2026).
-- Supabase > SQL Editor > New query > pegar todo > Run. Se puede repetir sin problema.

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

insert into public.cities (slug, name, region, lat, lng, active)
values ('temuco', 'Temuco', 'La Araucanía', -38.735900, -72.590400, true)
on conflict (slug) do update set active = true;

insert into public.cities (slug, name, region, lat, lng, active) values
  ('pucon', 'Pucón', 'La Araucanía', -39.272300, -71.977500, true),
  ('curacautin', 'Curacautín', 'La Araucanía', -38.433300, -71.883300, true)
on conflict (slug) do update set active = true;

create or replace function public.server_time() returns timestamptz
language sql stable as $$ select now() $$;
revoke execute on function public.server_time() from public, anon;
grant execute on function public.server_time() to authenticated;

create or replace function public._is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and auth.uid() in (a, b)
     and exists (
       select 1 from public.user_blocks
        where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;
create or replace function public.is_request_participant(p_request_id uuid, p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user is not null and p_user = auth.uid() and (
    exists (select 1 from public.requests r where r.id = p_request_id and r.requester_id = p_user)
    or exists (select 1 from public.request_assignments a
               where a.request_id = p_request_id and a.collaborator_id = p_user))
$$;
create or replace function public.is_request_owner(p_request_id uuid, p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user is not null and p_user = auth.uid() and exists (
    select 1 from public.requests r where r.id = p_request_id and r.requester_id = p_user)
$$;
alter table public.profiles add column if not exists deletion_requested_at timestamptz;
create or replace function public.request_account_deletion() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := public._require_user();
begin
  update public.profiles set deletion_requested_at = now() where id = uid;
end $$;
create or replace function public.can_delete_evidence(p_path text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare parts text[] := string_to_array(p_path, '/'); v_req uuid; v_sub uuid;
begin
  if auth.uid() is null or array_length(parts, 1) <> 3 then return false; end if;
  begin v_req := parts[1]::uuid; v_sub := parts[2]::uuid; exception when others then return false; end;
  -- a) Fotos del propio borrador (antes de entregar).
  if exists (select 1 from public.evidence_submissions s
              where s.id = v_sub and s.request_id = v_req and s.status = 'borrador'
                and s.collaborator_id = auth.uid()) then
    return true;
  end if;
  -- b) Eliminación de cuenta en curso (pedida hace menos de 1 hora).
  return exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.deletion_requested_at > now() - interval '1 hour')
     and public.is_request_participant(v_req, auth.uid());
end $$;
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
  if (select count(*) from storage.objects o
       where o.bucket_id = 'evidence' and o.name like v_req::text || '/' || v_sub::text || '/%') >= 8 then
    return false;
  end if;
  return exists (
    select 1 from public.evidence_submissions s
      join public.request_assignments a on a.id = s.assignment_id
     where s.id = v_sub and s.request_id = v_req and s.status = 'borrador'
       and s.collaborator_id = auth.uid() and a.status = 'activa' and a.due_at > now());
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
  if p_request_id is not null and not exists (
       select 1 from public.requests r where r.id = p_request_id
          and (public.is_request_participant(r.id, uid)
               or (r.status = 'disponible' and not r.moderation_hidden))) then
    perform public._err('NOT_FOUND'); end if;
  if p_submission_id is not null and not exists (
       select 1 from public.evidence_submissions s join public.requests r on r.id = s.request_id
        where s.id = p_submission_id and uid in (r.requester_id, s.collaborator_id)) then
    perform public._err('NOT_FOUND'); end if;
  if p_reported_user_id is not null and not exists (select 1 from public.profiles where id = p_reported_user_id) then
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
  if p_request_id is not null then
    select count(distinct reporter_id) into v_reporters from public.reports
     where request_id = p_request_id and status = 'abierto';
    if v_reporters >= 3 then
      update public.requests set moderation_hidden = true, updated_at = now() where id = p_request_id;
    end if;
  end if;
  return rep;
end $$;
revoke execute on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
revoke execute on function public._is_blocked_between(uuid, uuid), public.is_request_participant(uuid, uuid),
  public.is_request_owner(uuid, uuid), public.can_delete_evidence(text), public.can_upload_evidence(text),
  public.report_content(text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public._is_blocked_between(uuid, uuid), public.is_request_participant(uuid, uuid),
  public.is_request_owner(uuid, uuid), public.can_delete_evidence(text), public.can_upload_evidence(text),
  public.report_content(text, text, uuid, uuid, uuid) to authenticated;

