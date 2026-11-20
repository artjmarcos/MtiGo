// Traduce errores del servidor (MTIGO_<CODIGO>) y de red a mensajes en español.
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Tu sesión expiró. Ingresa nuevamente.',
  PROFILE_REQUIRED: 'Tu perfil no está disponible. Vuelve a ingresar.',
  TERMS_REQUIRED: 'Debes aceptar los términos y condiciones.',
  INVALID_TITLE: 'El título debe tener entre 5 y 80 caracteres.',
  INVALID_DESCRIPTION: 'La descripción debe tener entre 10 y 500 caracteres.',
  INVALID_CATEGORY: 'Categoría no válida.',
  INVALID_EVIDENCE_TYPE: 'Tipo de evidencia no válido.',
  INVALID_REWARD: 'La recompensa debe estar entre $100 y $50.000 CLP.',
  INVALID_ADDRESS: 'Indica una dirección válida.',
  INVALID_CITY: 'Ciudad no disponible todavía.',
  INVALID_EXPIRY: 'El vencimiento debe estar entre 10 minutos y 72 horas.',
  INVALID_LOCATION: 'Ubicación no válida.',
  INVALID_RADIUS: 'Radio de búsqueda no válido.',
  INVALID_NAME: 'El nombre debe tener entre 2 y 40 caracteres.',
  INVALID_PHONE: 'Teléfono no válido. Ej: +56 9 1234 5678',
  TOO_MANY_ACTIVE: 'Alcanzaste el máximo de solicitudes o colaboraciones activas.',
  RATE_LIMIT: 'Demasiadas acciones seguidas. Espera un momento.',
  NOT_FOUND: 'No se encontró la solicitud o ya no está disponible.',
  NOT_ALLOWED: 'No tienes permiso para realizar esta acción.',
  OWN_REQUEST: 'No puedes aceptar tu propia solicitud.',
  ALREADY_TAKEN: 'Otro colaborador aceptó esta solicitud primero.',
  EXPIRED: 'La solicitud ya venció.',
  BLOCKED: 'No puedes interactuar con este usuario.',
  INVALID_STATE: 'La solicitud cambió de estado. Actualiza la pantalla.',
  EVIDENCE_PHOTO_REQUIRED: 'Esta solicitud requiere al menos una foto.',
  EVIDENCE_TEXT_REQUIRED: 'Esta solicitud requiere una respuesta escrita.',
  INVALID_TEXT: 'La respuesta es demasiado larga.',
  TOO_MANY_FILES: 'Máximo 4 fotos.',
  FILE_NOT_UPLOADED: 'La foto no llegó al servidor. Intenta subirla de nuevo.',
  INVALID_PATH: 'Ruta de archivo no válida.',
  INVALID_FILE_TYPE: 'Formato de imagen no permitido.',
  INVALID_FILE_SIZE: 'La foto supera 5 MB.',
  REASON_REQUIRED: 'Explica el motivo del rechazo (mínimo 5 caracteres).',
  INVALID_MESSAGE: 'El mensaje no puede estar vacío.',
  INVALID_TARGET: 'No se puede reportar o bloquear este elemento.',
  INVALID_DECISION: 'Decisión no válida.',
};

export function errorCode(err: unknown): string | null {
  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  const m = /MTIGO_([A-Z_]+)/.exec(msg);
  return m ? m[1] : null;
}

export function friendlyError(err: unknown): string {
  const code = errorCode(err);
  if (code && MESSAGES[code]) return MESSAGES[code];
  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  if (/JWT|session/i.test(msg)) return 'Tu sesión expiró. Ingresa nuevamente.';
  if (/row-level security|permission denied/i.test(msg)) return 'No tienes permiso para realizar esta acción.';
  if (/exceeded|too large|Payload/i.test(msg)) return 'El archivo es demasiado grande.';
  return 'Ocurrió un error. Intenta nuevamente.';
}

export function friendlyAuthError(err: unknown): string {
  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(msg)) return 'Debes confirmar tu correo antes de ingresar.';
  if (/already registered|already exists/i.test(msg)) return 'Ya existe una cuenta con ese correo.';
  if (/Password should be|weak/i.test(msg)) return 'La contraseña es muy débil (mínimo 8 caracteres).';
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos. Espera unos minutos.';
  return friendlyError(err);
}
