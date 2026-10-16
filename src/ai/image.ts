import type { UserImage } from './assistant';

/** Long side in pixels: larger photos are scaled down by the API anyway, so sending more only costs time. */
const MAX_SIDE = 1568;
const JPEG_QUALITY = 0.85;

export interface PreparedImage extends UserImage {
  /** Data URL for the thumbnail in the chat. */
  preview: string;
}

/** Scale a photo down on the phone and encode it as JPEG. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const preview = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { mediaType: 'image/jpeg', data: preview.slice(preview.indexOf(',') + 1), preview };
}
