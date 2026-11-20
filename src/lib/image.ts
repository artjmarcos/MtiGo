// Compresión de fotos en el dispositivo: reduce datos móviles y almacenamiento.
// Máx. 1600 px de lado, JPEG calidad 0.75 (normalmente 150–400 KB).
export const MAX_SIDE = 1600;

export function targetSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h };
  const scale = max / Math.max(w, h);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export async function compressImage(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
    throw new Error('Formato de imagen no permitido.');
  }
  const bitmap = await loadBitmap(file);
  const { w, h } = targetSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.75));
  if (!blob) throw new Error('No se pudo comprimir la imagen.');
  if (blob.size > 5 * 1024 * 1024) throw new Error('La foto supera 5 MB.');
  return blob;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* respaldo abajo */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
