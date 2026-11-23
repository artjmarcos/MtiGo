import { describe, expect, test } from 'vitest';
import { watermarkLines, requestCode } from '../../src/lib/camera';

describe('marca de agua de fotos', () => {
  const id = '3f9a2c71-0b4f-4a39-9d55-2c7a7c1a1a11';
  test('código corto de solicitud', () => expect(requestCode(id)).toBe('3F9A2C'));
  test('fecha y hora de Chile, ciudad y código', () => {
    const [l1, l2] = watermarkLines(new Date('2026-11-23T16:45:12Z'), 'Villarrica', id, true);
    expect(l1).toBe('MtiGo! · 23-11-2026 13:45:12');
    expect(l2).toBe('Villarrica · Solicitud #3F9A2C · Foto tomada en la app');
  });
  test('avisa si no se pudo usar la hora del servidor', () => {
    const [l1] = watermarkLines(new Date('2026-11-23T16:45:12Z'), 'Pucón', id, false);
    expect(l1).toContain('(hora del teléfono)');
  });
});
