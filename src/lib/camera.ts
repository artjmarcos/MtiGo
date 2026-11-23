// Cámara en vivo dentro de la app (sin acceso a la galería).
// Cada foto lleva una marca de agua con fecha y hora del SERVIDOR (no la del
// teléfono, que se puede cambiar), la ciudad y el código de la solicitud.
import { escapeHtml } from './dom';
import { serverTime } from './api';

const MAX_SIDE = 1600;

/** Diferencia entre la hora del servidor y la del teléfono (ms). */
let serverOffset: number | null = null;

export async function syncServerTime(): Promise<void> {
  try {
    const t0 = Date.now();
    const data = await serverTime();
    const t1 = Date.now();
    serverOffset = new Date(data).getTime() - (t0 + t1) / 2;
  } catch { /* sin conexión: se usará la hora del teléfono y se indicará */ }
}

export function trustedNow(): { date: Date; fromServer: boolean } {
  return serverOffset === null
    ? { date: new Date(), fromServer: false }
    : { date: new Date(Date.now() + serverOffset), fromServer: true };
}

/** Código corto de la solicitud que aparece en la marca de agua. */
export function requestCode(requestId: string): string {
  return requestId.replace(/-/g, '').slice(0, 6).toUpperCase();
}

/** Texto de la marca de agua (función pura, probada con pruebas unitarias). */
export function watermarkLines(date: Date, city: string, requestId: string, fromServer: boolean): [string, string] {
  const f = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const p = (type: string) => f.find((x) => x.type === type)?.value ?? '';
  const when = `${p('day')}-${p('month')}-${p('year')} ${p('hour')}:${p('minute')}:${p('second')}`;
  return [
    `MtiGo! · ${when}${fromServer ? '' : ' (hora del teléfono)'}`,
    `${city} · Solicitud #${requestCode(requestId)} · Foto tomada en la app`,
  ];
}

export function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, lines: [string, string]): void {
  const size = Math.max(16, Math.round(w / 38));
  const pad = Math.round(size * 0.6);
  const band = size * 2 + pad * 3;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, h - band, w, band);
  ctx.fillStyle = '#FF8A00';
  ctx.fillRect(0, h - band, Math.max(6, Math.round(size / 3)), band);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${size}px Poppins, system-ui, sans-serif`;
  ctx.fillText(lines[0], pad * 2, h - band + pad, w - pad * 3);
  ctx.font = `500 ${Math.round(size * 0.85)}px system-ui, sans-serif`;
  ctx.fillText(lines[1], pad * 2, h - band + pad * 2 + size, w - pad * 3);
}

export class CameraError extends Error {}

/**
 * Abre la cámara a pantalla completa y devuelve la foto (JPEG con marca de agua),
 * o null si la persona cancela.
 */
export function capturePhoto(opts: { city: string; requestId: string }): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    if (!navigator.mediaDevices?.getUserMedia) { reject(new CameraError('Este dispositivo no permite usar la cámara desde la app.')); return; }
    const wrap = document.createElement('div');
    wrap.className = 'camera';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Cámara');
    wrap.innerHTML = `
      <video playsinline muted autoplay></video>
      <div class="camera-hint">${escapeHtml('Toma la foto ahora, en el lugar. No se pueden usar fotos de la galería.')}</div>
      <div class="camera-bar">
        <button type="button" class="camera-btn" data-c="cancel" aria-label="Cancelar">✕</button>
        <button type="button" class="camera-shutter" data-c="shot" aria-label="Tomar foto"></button>
        <button type="button" class="camera-btn" data-c="flip" aria-label="Cambiar cámara">⟲</button>
      </div>`;
    document.body.appendChild(wrap);
    const video = wrap.querySelector('video') as HTMLVideoElement;
    let stream: MediaStream | null = null;
    let facing: 'environment' | 'user' = 'environment';

    const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; };
    const close = (v: Blob | null, err?: Error) => { stop(); wrap.remove(); if (err) reject(err); else resolve(v); };

    async function start(): Promise<void> {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false,
        });
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      } catch (e) {
        const name = (e as DOMException)?.name;
        close(null, new CameraError(name === 'NotAllowedError'
          ? 'Debes permitir el acceso a la cámara para responder con foto.'
          : 'No se pudo abrir la cámara.'));
      }
    }

    wrap.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('[data-c]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.c === 'cancel') close(null);
      if (b.dataset.c === 'flip') { facing = facing === 'environment' ? 'user' : 'environment'; void start(); }
      if (b.dataset.c === 'shot') {
        const vw = video.videoWidth; const vh = video.videoHeight;
        if (!vw || !vh) return;
        const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
        const w = Math.round(vw * scale); const h = Math.round(vh * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { close(null, new CameraError('No se pudo procesar la foto.')); return; }
        ctx.drawImage(video, 0, 0, w, h);
        const { date, fromServer } = trustedNow();
        drawWatermark(ctx, w, h, watermarkLines(date, opts.city, opts.requestId, fromServer));
        wrap.classList.add('flash');
        canvas.toBlob((blob) => (blob ? close(blob) : close(null, new CameraError('No se pudo guardar la foto.'))), 'image/jpeg', 0.8);
      }
    });
    void start();
  });
}
