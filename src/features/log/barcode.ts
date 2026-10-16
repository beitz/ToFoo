/**
 * Reading barcodes with the browser's BarcodeDetector (Chrome on Android has it; most desktop
 * browsers do not, so typing the number is always offered too).
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

export const canDetectBarcodes = () => !!detectorClass();

let detector: Promise<BarcodeDetectorLike | null> | undefined;

function getDetector(): Promise<BarcodeDetectorLike | null> {
  detector ??= (async () => {
    const Detector = detectorClass();
    if (!Detector) return null;
    const supported = (await Detector.getSupportedFormats?.().catch(() => FORMATS)) ?? FORMATS;
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new Detector({ formats }) : null;
  })();
  return detector;
}

/** Valid product barcodes found in an image, video frame or photo. Empty when none (or no detector). */
export async function detectBarcodes(source: ImageBitmapSource): Promise<string[]> {
  const d = await getDetector();
  if (!d) return [];
  try {
    const found = await d.detect(source);
    return [...new Set(found.map((b) => normalizeBarcode(b.rawValue)).filter((c): c is string => !!c))];
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
