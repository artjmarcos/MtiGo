import { describe, expect, test } from 'vitest';
import { html, raw } from '../../src/lib/dom';
import { parseRoute } from '../../src/lib/router';
import { friendlyError, errorCode } from '../../src/lib/errors';
import { targetSize } from '../../src/lib/image';

describe('plantillas seguras', () => {
  test('escapa contenido de usuarios (anti-XSS)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    expect(html`<p>${evil}</p>`.value).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
    expect(html`<a title="${'" onclick="x'}">`.value).not.toContain('" onclick');
    expect(html`${raw('<b>ok</b>')}`.value).toBe('<b>ok</b>');
    expect(html`${['<i>', raw('<u>')]}`.value).toBe('&lt;i&gt;<u>');
  });
});

describe('rutas', () => {
  test('rutas conocidas', () => {
    expect(parseRoute('#/explorar').name).toBe('explore');
    expect(parseRoute('').name).toBe('explore');
    expect(parseRoute('#/solicitud/0b4f9b0e-2a52-4a39-9d55-2c7a7c1a1a11')).toEqual({ name: 'request', params: { id: '0b4f9b0e-2a52-4a39-9d55-2c7a7c1a1a11' } });
    expect(parseRoute('#/legal/privacidad').params.doc).toBe('privacidad');
    expect(parseRoute('#/solicitud/no-es-uuid').name).toBe('notFound');
  });
  test('enlaces de recuperación de Supabase no se tratan como rutas', () => {
    expect(parseRoute('#access_token=abc&type=recovery').name).toBe('authCallback');
  });
});

describe('errores', () => {
  test('códigos del servidor a español', () => {
    expect(errorCode({ message: 'MTIGO_ALREADY_TAKEN' })).toBe('ALREADY_TAKEN');
    expect(friendlyError({ message: 'MTIGO_ALREADY_TAKEN' })).toMatch(/primero/);
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/conexión/);
    expect(friendlyError({ message: 'algo raro' })).toMatch(/error/);
  });
});

describe('compresión de imágenes', () => {
  test('reduce al lado máximo manteniendo proporción', () => {
    expect(targetSize(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(targetSize(800, 600)).toEqual({ w: 800, h: 600 });
    expect(targetSize(3000, 4000)).toEqual({ w: 1200, h: 1600 });
  });
});
