// Formateo puro (sin DOM): probado con pruebas unitarias.
export type RequestStatus =
  | 'disponible' | 'aceptada' | 'en_proceso' | 'evidencia_entregada'
  | 'aprobada' | 'rechazada' | 'vencida' | 'cancelada';
export type EvidenceType = 'foto' | 'texto' | 'foto_texto';

export const STATUS_LABEL: Record<RequestStatus, string> = {
  disponible: 'Disponible',
  aceptada: 'Aceptada',
  en_proceso: 'En proceso',
  evidencia_entregada: 'Evidencia entregada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
};

/** Color de la identidad MtiGo! según estado. */
export const STATUS_TONE: Record<RequestStatus, 'green' | 'orange' | 'red' | 'teal' | 'gray'> = {
  disponible: 'green',
  aceptada: 'teal',
  en_proceso: 'teal',
  evidencia_entregada: 'orange',
  aprobada: 'green',
  rechazada: 'red',
  vencida: 'gray',
  cancelada: 'gray',
};

export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  foto: '📷 Foto',
  texto: '✍️ Texto',
  foto_texto: '📷 Foto + ✍️ texto',
};

const clp = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export function formatClp(amount: number): string {
  return `$${clp.format(Math.round(amount))}`;
}

/** Estado visible: una solicitud "disponible" cuyo plazo pasó se muestra como vencida. */
export function effectiveStatus(status: RequestStatus, expiresAt: string | Date, now: Date = new Date()): RequestStatus {
  if (status === 'disponible' && new Date(expiresAt).getTime() <= now.getTime()) return 'vencida';
  return status;
}

export function timeRemaining(expiresAt: string | Date, now: Date = new Date()): string | null {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}

export function formatDistance(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined || Number.isNaN(meters)) return null;
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

const dateFmt = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
});

export function formatDateTime(value: string | Date): string {
  return dateFmt.format(new Date(value));
}

export function relativeTime(value: string | Date, now: Date = new Date()): string {
  const diff = Math.round((now.getTime() - new Date(value).getTime()) / 60000);
  if (diff < 1) return 'ahora';
  if (diff < 60) return `hace ${diff} min`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `hace ${h} h`;
  return formatDateTime(value);
}
