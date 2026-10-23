/**
 * Barcode reading for browsers without a built-in BarcodeDetector (Safari on iPhone, most desktop
 * browsers): ZXing compiled to WebAssembly. The .wasm file is bundled and served from ToFoo's own
 * site; the library's default of fetching it from a CDN would be a third-party request.
 * Loaded only when a barcode is first looked for.
 */
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });

/** Long side of the image handed to ZXing: enough for a barcode in a packaging photo, small enough to scan a few times a second. */
const MAX_SIDE = 1280;

let canvas: HTMLCanvasElement | undefined;

/** Raw barcode texts in a video frame or picture; product formats only (EAN-13, EAN-8, UPC-A). */
export async function readRetailBarcodes(source: HTMLVideoElement | ImageBitmap): Promise<string[]> {
  const w = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!w || !h) return [];
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  canvas ??= document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const found = await readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), { formats: ['EAN13', 'EAN8', 'UPCA'], tryHarder: true, maxNumberOfSymbols: 1 });
  return found.filter((b) => b.isValid).map((b) => b.text);
}
