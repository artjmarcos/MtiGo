// Validación en el cliente: misma regla que el servidor, solo para dar
// mensajes inmediatos. El servidor vuelve a validar todo.
import type { EvidenceType } from './format';

export interface RequestDraft {
  title: string;
  description: string;
  category: string;
  evidenceType: EvidenceType | '';
  rewardClp: number;
  address: string;
  expiresInMinutes: number;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
}

export const LIMITS = {
  titleMin: 5, titleMax: 80,
  descriptionMin: 10, descriptionMax: 500,
  rewardMin: 100, rewardMax: 50000,
  addressMin: 3, addressMax: 200,
  expiryMinMinutes: 10, expiryMaxMinutes: 72 * 60,
  radiusMin: 100, radiusMax: 5000,
  evidenceTextMax: 2000,
  maxPhotos: 4,
  maxPhotoBytes: 5 * 1024 * 1024,
} as const;

export type FieldErrors = Partial<Record<keyof RequestDraft, string>>;

export function validateRequestDraft(d: RequestDraft): FieldErrors {
  const e: FieldErrors = {};
  const title = d.title.trim();
  const description = d.description.trim();
  const address = d.address.trim();
  if (title.length < LIMITS.titleMin || title.length > LIMITS.titleMax)
    e.title = `El título debe tener entre ${LIMITS.titleMin} y ${LIMITS.titleMax} caracteres.`;
  if (description.length < LIMITS.descriptionMin || description.length > LIMITS.descriptionMax)
    e.description = `La descripción debe tener entre ${LIMITS.descriptionMin} y ${LIMITS.descriptionMax} caracteres.`;
  if (!d.category) e.category = 'Elige una categoría.';
  if (!d.evidenceType) e.evidenceType = 'Elige el tipo de evidencia.';
  if (!Number.isInteger(d.rewardClp) || d.rewardClp < LIMITS.rewardMin || d.rewardClp > LIMITS.rewardMax)
    e.rewardClp = `La recompensa debe estar entre $${LIMITS.rewardMin} y $${LIMITS.rewardMax.toLocaleString('es-CL')} CLP.`;
  if (address.length < LIMITS.addressMin || address.length > LIMITS.addressMax)
    e.address = 'Indica una dirección o lugar.';
  if (d.expiresInMinutes < LIMITS.expiryMinMinutes || d.expiresInMinutes > LIMITS.expiryMaxMinutes)
    e.expiresInMinutes = 'El vencimiento debe estar entre 10 minutos y 72 horas.';
  if ((d.lat === null) !== (d.lng === null)) e.lat = 'Ubicación incompleta.';
  if (d.radiusM !== null) {
    if (d.lat === null) e.radiusM = 'El radio requiere tu ubicación.';
    else if (d.radiusM < LIMITS.radiusMin || d.radiusM > LIMITS.radiusMax) e.radiusM = 'Radio fuera de rango.';
  }
  return e;
}

export interface EvidenceDraft {
  evidenceType: EvidenceType;
  text: string;
  photoCount: number;
}

export function validateEvidence(d: EvidenceDraft): string | null {
  const text = d.text.trim();
  if ((d.evidenceType === 'foto' || d.evidenceType === 'foto_texto') && d.photoCount === 0)
    return 'Esta solicitud requiere al menos una foto.';
  if ((d.evidenceType === 'texto' || d.evidenceType === 'foto_texto') && text.length < 3)
    return 'Esta solicitud requiere una respuesta escrita.';
  if (text.length > LIMITS.evidenceTextMax) return 'La respuesta es demasiado larga.';
  if (d.photoCount > LIMITS.maxPhotos) return 'Máximo 4 fotos.';
  return null;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function validatePassword(pw: string): boolean {
  return pw.length >= 8;
}

/** Ruta de Storage: <request_id>/<submission_id>/<uuid>.<ext> (debe coincidir con la política). */
export function evidencePath(requestId: string, submissionId: string, fileId: string, ext: 'jpg' | 'png' | 'webp'): string {
  return `${requestId}/${submissionId}/${fileId}.${ext}`;
}
