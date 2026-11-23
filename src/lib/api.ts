// Acceso a datos. Todas las escrituras son RPC validadas en el servidor.
// Los nombres de funciones/parámetros se verifican contra la base de datos
// en tests/db/contract.test.mjs.
import { sb } from '../supabase';
import type { EvidenceType, RequestStatus } from './format';

export interface Category { slug: string; name_es: string; icon: string; sort: number }
export interface City { slug: string; name: string; active: boolean; lat: number; lng: number }

export interface RequestRow {
  id: string;
  requester_id: string;
  title: string;
  description: string;
  category_slug: string;
  evidence_type: EvidenceType;
  reward_clp: number;
  address: string;
  city_slug: string;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  expires_at: string;
  status: RequestStatus;
  created_at: string;
  updated_at?: string;
}

export interface ListedRequest extends RequestRow { requester_name: string; distance_m: number | null }

export interface Assignment {
  id: string; request_id: string; collaborator_id: string; status: string;
  due_at: string; accepted_at: string; finished_at: string | null;
}

export interface Submission {
  id: string; request_id: string; assignment_id: string; collaborator_id: string;
  body_text: string | null; status: 'borrador' | 'entregada' | 'aprobada' | 'rechazada';
  rejection_reason: string | null; created_at: string; submitted_at: string | null; reviewed_at: string | null;
}

export interface EvidenceFile { id: string; submission_id: string; storage_path: string; mime_type: string; size_bytes: number; created_at: string }
export interface HistoryRow { id: number; from_status: RequestStatus | null; to_status: RequestStatus; actor_id: string | null; note: string | null; created_at: string }
export interface Message { id: string; request_id: string; sender_id: string; body: string; created_at: string }
export interface Notification { id: string; kind: string; request_id: string | null; title: string; body: string; read_at: string | null; created_at: string }
export interface Profile { id: string; display_name: string; city_slug: string; notify_new_requests: boolean; accepted_terms_at: string | null; created_at: string }

async function rpc<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().rpc(name, params);
  if (error) throw error;
  return data as T;
}

function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// ---------- catálogos ----------
export async function getCategories(): Promise<Category[]> {
  return must(await sb().from('categories').select('slug,name_es,icon,sort').eq('active', true).order('sort'));
}
export async function getCities(): Promise<City[]> {
  return must(await sb().from('cities').select('slug,name,active,lat,lng').order('name'));
}

// ---------- perfil ----------
export async function getMyProfile(userId: string): Promise<{ profile: Profile; phone: string | null }> {
  const profile = must(await sb().from('profiles').select('*').eq('id', userId).single()) as Profile;
  const priv = must(await sb().from('profile_private').select('phone').eq('user_id', userId).maybeSingle()) as { phone: string | null } | null;
  return { profile, phone: priv?.phone ?? null };
}
export function updateMyProfile(p: { displayName: string; citySlug: string; phone: string; notify: boolean }) {
  return rpc<Profile>('update_my_profile', {
    p_display_name: p.displayName, p_city_slug: p.citySlug, p_phone: p.phone, p_notify_new_requests: p.notify,
  });
}
export function acceptTerms() { return rpc<Profile>('accept_terms'); }

// ---------- solicitudes ----------
export interface CreateRequestInput {
  clientRequestId: string; title: string; description: string; category: string; evidenceType: EvidenceType;
  rewardClp: number; address: string; citySlug: string; expiresAt: string;
  lat: number | null; lng: number | null; radiusM: number | null;
}
export function createRequest(i: CreateRequestInput) {
  return rpc<RequestRow>('create_request', {
    p_client_request_id: i.clientRequestId, p_title: i.title, p_description: i.description,
    p_category_slug: i.category, p_evidence_type: i.evidenceType, p_reward_clp: i.rewardClp,
    p_address: i.address, p_city_slug: i.citySlug, p_expires_at: i.expiresAt,
    p_lat: i.lat, p_lng: i.lng, p_radius_m: i.radiusM,
  });
}

export interface ListFilters {
  citySlug: string; category: string | null; minReward: number | null; search: string;
  lat: number | null; lng: number | null; radiusKm: number | null;
}
export function listAvailable(f: ListFilters) {
  return rpc<ListedRequest[]>('list_available_requests', {
    p_city_slug: f.citySlug, p_category_slug: f.category, p_min_reward: f.minReward, p_max_reward: null,
    p_search: f.search || null, p_lat: f.lat, p_lng: f.lng, p_radius_km: f.radiusKm, p_limit: 100, p_offset: 0,
  });
}
export function serverTime() { return rpc<string>('server_time'); }
export function expireOverdue() { return rpc<number>('expire_overdue_requests'); }

export async function getRequest(id: string): Promise<RequestRow | null> {
  return must(await sb().from('requests').select('*').eq('id', id).maybeSingle()) as RequestRow | null;
}
export async function getProfileName(id: string): Promise<string> {
  const row = must(await sb().from('profiles').select('display_name').eq('id', id).maybeSingle()) as { display_name: string } | null;
  return row?.display_name ?? 'Usuario eliminado';
}
export async function getAssignments(requestId: string): Promise<Assignment[]> {
  return must(await sb().from('request_assignments').select('*').eq('request_id', requestId).order('accepted_at', { ascending: false })) as Assignment[];
}
export async function getSubmissions(requestId: string): Promise<Submission[]> {
  return must(await sb().from('evidence_submissions').select('*').eq('request_id', requestId).order('created_at', { ascending: false })) as Submission[];
}
export async function getFiles(submissionId: string): Promise<EvidenceFile[]> {
  return must(await sb().from('evidence_files').select('*').eq('submission_id', submissionId).order('created_at')) as EvidenceFile[];
}
export async function getHistory(requestId: string): Promise<HistoryRow[]> {
  return must(await sb().from('request_status_history').select('*').eq('request_id', requestId).order('id')) as HistoryRow[];
}
export async function getMessages(requestId: string): Promise<Message[]> {
  return must(await sb().from('messages').select('*').eq('request_id', requestId).order('created_at')) as Message[];
}

export function acceptRequest(id: string) { return rpc<Assignment>('accept_request', { p_request_id: id }); }
export function releaseRequest(id: string) { return rpc<RequestRow>('release_request', { p_request_id: id }); }
export function cancelRequest(id: string, reason: string) { return rpc<RequestRow>('cancel_request', { p_request_id: id, p_reason: reason }); }
export function startSubmission(requestId: string) { return rpc<Submission>('start_submission', { p_request_id: requestId }); }
export function addEvidenceFile(submissionId: string, path: string, mime: string, size: number) {
  return rpc<EvidenceFile>('add_evidence_file', { p_submission_id: submissionId, p_storage_path: path, p_mime_type: mime, p_size_bytes: size });
}
export function removeEvidenceFile(fileId: string) { return rpc<string>('remove_evidence_file', { p_file_id: fileId }); }
export function submitEvidence(submissionId: string, text: string) {
  return rpc<Submission>('submit_evidence', { p_submission_id: submissionId, p_body_text: text });
}
export function reviewEvidence(requestId: string, approve: boolean, reason: string | null) {
  return rpc<Submission>('review_evidence', { p_request_id: requestId, p_approve: approve, p_reason: reason });
}
export function sendMessage(requestId: string, body: string) { return rpc<Message>('send_message', { p_request_id: requestId, p_body: body }); }

// ---------- Storage (fotos privadas) ----------
const BUCKET = 'evidence';
export async function uploadEvidence(path: string, blob: Blob, contentType: string): Promise<void> {
  const { error } = await sb().storage.from(BUCKET).upload(path, blob, { contentType, upsert: false, cacheControl: '3600' });
  if (error) throw error;
}
export async function deleteEvidenceObjects(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await sb().storage.from(BUCKET).remove(paths);
  if (error) throw error;
}
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

// ---------- actividad ----------
export async function myRequests(userId: string): Promise<RequestRow[]> {
  return must(await sb().from('requests').select('*').eq('requester_id', userId).order('created_at', { ascending: false }).limit(100)) as RequestRow[];
}
export async function myCollaborations(userId: string): Promise<(Assignment & { requests: RequestRow | null })[]> {
  return must(await sb().from('request_assignments').select('*, requests(*)').eq('collaborator_id', userId)
    .order('accepted_at', { ascending: false }).limit(100)) as (Assignment & { requests: RequestRow | null })[];
}

// ---------- avisos ----------
export async function getNotifications(): Promise<Notification[]> {
  return must(await sb().from('notifications').select('*').order('created_at', { ascending: false }).limit(100)) as Notification[];
}
export async function unreadCount(): Promise<number> {
  const { count, error } = await sb().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}
export function markRead(ids: string[] | null) { return rpc<number>('mark_notifications_read', { p_ids: ids }); }

// ---------- moderación ----------
export function reportContent(p: { reason: string; details: string; requestId?: string | null; submissionId?: string | null; userId?: string | null }) {
  return rpc('report_content', {
    p_reason: p.reason, p_details: p.details, p_request_id: p.requestId ?? null,
    p_submission_id: p.submissionId ?? null, p_reported_user_id: p.userId ?? null,
  });
}
export function blockUser(userId: string) { return rpc('block_user', { p_user_id: userId }); }
export function unblockUser(userId: string) { return rpc('unblock_user', { p_user_id: userId }); }
export async function myBlocks(): Promise<{ blocked_id: string; name: string }[]> {
  const rows = must(await sb().from('user_blocks').select('blocked_id, profiles!user_blocks_blocked_id_fkey(display_name)')) as
    { blocked_id: string; profiles: { display_name: string } | null }[];
  return rows.map((r) => ({ blocked_id: r.blocked_id, name: r.profiles?.display_name ?? 'Usuario' }));
}

// ---------- cuenta ----------
export function requestAccountDeletion() { return rpc<void>('request_account_deletion'); }
export function myEvidencePaths() { return rpc<string[]>('my_evidence_paths'); }
export function deleteMyAccount() { return rpc<void>('delete_my_account'); }
