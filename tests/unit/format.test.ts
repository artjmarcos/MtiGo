import { describe, expect, test } from 'vitest';
import { effectiveStatus, formatClp, formatDistance, timeRemaining, relativeTime } from '../../src/lib/format';

const now = new Date('2026-11-20T12:00:00Z');
const plus = (min: number) => new Date(now.getTime() + min * 60000).toISOString();

describe('formato', () => {
  test('CLP con separador de miles chileno', () => {
    expect(formatClp(1000)).toBe('$1.000');
    expect(formatClp(50000)).toBe('$50.000');
    expect(formatClp(100)).toBe('$100');
  });
  test('tiempo restante', () => {
    expect(timeRemaining(plus(-1), now)).toBeNull();
    expect(timeRemaining(plus(0.5), now)).toBe('menos de 1 min');
    expect(timeRemaining(plus(45), now)).toBe('45 min');
    expect(timeRemaining(plus(120), now)).toBe('2 h');
    expect(timeRemaining(plus(135), now)).toBe('2 h 15 min');
    expect(timeRemaining(plus(60 * 50), now)).toBe('2 d 2 h');
  });
  test('una solicitud disponible vencida se muestra como vencida', () => {
    expect(effectiveStatus('disponible', plus(-5), now)).toBe('vencida');
    expect(effectiveStatus('disponible', plus(5), now)).toBe('disponible');
    expect(effectiveStatus('aceptada', plus(-5), now)).toBe('aceptada');
  });
  test('distancia', () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(234)).toBe('230 m');
    expect(formatDistance(2345)).toBe('2,3 km');
  });
  test('tiempo relativo', () => {
    expect(relativeTime(plus(-0.2), now)).toBe('ahora');
    expect(relativeTime(plus(-30), now)).toBe('hace 30 min');
    expect(relativeTime(plus(-180), now)).toBe('hace 3 h');
  });
});
