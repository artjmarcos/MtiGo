import { describe, expect, test } from 'vitest';
import { validateRequestDraft, validateEvidence, validateEmail, validatePassword, evidencePath, type RequestDraft } from '../../src/lib/validation';

const ok: RequestDraft = {
  title: '¿Hay fila en el banco?', description: 'Quiero saber cuánta gente hay esperando.', category: 'banco',
  evidenceType: 'foto_texto', rewardClp: 1000, address: 'Henríquez 400', expiresInMinutes: 60, lat: null, lng: null, radiusM: null,
};

describe('validación de solicitudes (cliente)', () => {
  test('borrador válido', () => expect(validateRequestDraft(ok)).toEqual({}));
  test('errores por campo', () => {
    const e = validateRequestDraft({ ...ok, title: 'ab', description: 'x', category: '', evidenceType: '', rewardClp: 50, address: '', expiresInMinutes: 5 });
    expect(Object.keys(e).sort()).toEqual(['address', 'category', 'description', 'evidenceType', 'expiresInMinutes', 'rewardClp', 'title']);
  });
  test('recompensa debe ser entera y en rango', () => {
    expect(validateRequestDraft({ ...ok, rewardClp: 1000.5 }).rewardClp).toBeTruthy();
    expect(validateRequestDraft({ ...ok, rewardClp: 50001 }).rewardClp).toBeTruthy();
  });
  test('radio solo con coordenadas', () => {
    expect(validateRequestDraft({ ...ok, radiusM: 500 }).radiusM).toBeTruthy();
    expect(validateRequestDraft({ ...ok, lat: -39.28, lng: -72.22, radiusM: 500 })).toEqual({});
    expect(validateRequestDraft({ ...ok, lat: -39.28, lng: null }).lat).toBeTruthy();
  });
});

describe('validación de evidencia', () => {
  test('foto obligatoria', () => expect(validateEvidence({ evidenceType: 'foto', text: '', photoCount: 0 })).toMatch(/foto/));
  test('texto obligatorio', () => expect(validateEvidence({ evidenceType: 'texto', text: ' ', photoCount: 2 })).toMatch(/escrita/));
  test('foto + texto completo', () => expect(validateEvidence({ evidenceType: 'foto_texto', text: 'Hay 5 personas', photoCount: 1 })).toBeNull());
  test('máximo de fotos', () => expect(validateEvidence({ evidenceType: 'foto', text: '', photoCount: 5 })).toMatch(/4/));
});

describe('credenciales y rutas', () => {
  test('correo', () => { expect(validateEmail('a@b.cl')).toBe(true); expect(validateEmail('a@b')).toBe(false); });
  test('contraseña', () => { expect(validatePassword('1234567')).toBe(false); expect(validatePassword('12345678')).toBe(true); });
  test('ruta de Storage compatible con la política del servidor', () => {
    const p = evidencePath('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'jpg');
    expect(p.split('/')).toHaveLength(3);
    expect(p.split('/')[2]).toMatch(/^[A-Za-z0-9_-]{8,80}\.(jpg|jpeg|png|webp)$/);
  });
});
