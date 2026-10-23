/**
 * Reading barcodes with the browser's BarcodeDetector where it has one (Chrome on Android), else
 * with the bundled ZXing reader (Safari on iPhone, most desktop browsers). Typing the number is
 * always offered too.
 */
import { normalizeBarcode } from '../../foods/openFoodFacts';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorClass {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/** Retail product barcodes (EAN/UPC); QR codes and the like are not food products. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a'];

function detectorClass(): BarcodeDetectorClass | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector : undefined;
}

export const canDetectBarcodes = () => !!detectorClass() || typeof WebAssembly !== 'undefined';

type Reader = (source: HTMLVideoElement | ImageBitmap) => Promise<string[]>;

let reader: Promise<Reader | null> | undefined;

function getReader(): Promise<Reader | null> {
  reader ??= (async () => {
    const Detector = detectorClass();
    if (Detector) {
      const supported = (await Detector.getSupportedFormats?.().catch(() => FORMATS)) ?? FORMATS;
      const formats = FORMATS.filter((f) => supported.includes(f));
      if (formats.length) {
        const d = new Detector({ formats });
        return async (source) => (await d.detect(source)).map((b) => b.rawValue);
      }
    }
    if (typeof WebAssembly === 'undefined') return null;
    try {
      return (await import('./zxingBarcodes')).readRetailBarcodes;
    } catch {
      // Offline before the reader was ever loaded: try again next time.
      reader = undefined;
      return null;
    }
  })();
  return reader;
}

/** Valid product barcodes found in a video frame or picture. Empty when none (or no reader). */
export async function detectBarcodes(source: HTMLVideoElement | ImageBitmap): Promise<string[]> {
  const read = await getReader();
  if (!read) return [];
  try {
    const found = await read(source);
    return [...new Set(found.map((raw) => normalizeBarcode(raw)).filter((c): c is string => !!c))];
  } catch {
    return [];
  }
}

/** Barcodes in a photo file (e.g. a packaging photo sent to the assistant). */
export async function barcodesInPhoto(file: Blob): Promise<string[]> {
  if (!canDetectBarcodes()) return [];
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    return await detectBarcodes(bitmap);
  } catch {
    return [];
  } finally {
    bitmap?.close();
  }
}
