/**
 * When was a photo taken? Read from the JPEG's EXIF data (DateTimeOriginal), falling back to the
 * file's date. Pickers and messaging apps sometimes strip EXIF or re-save the file, so the source
 * travels with the time and the user sees which one it is.
 */

export type PhotoTimeSource = 'photo' | 'file' | 'unknown';

export interface PhotoTime {
  /** Epoch ms; absent when unknown. */
  time?: number;
  source: PhotoTimeSource;
}

/** EXIF sits in the first segment of a JPEG, well within this. */
const EXIF_SCAN_BYTES = 256 * 1024;
/**
 * A file date this close to now is the time the file was handed over, not taken: some pickers
 * create a fresh copy. Not a physiological number, just a tolerance for clocks.
 */
const FRESH_COPY_MS = 2 * 60_000;

const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;

/**
 * Parse "YYYY:MM:DD HH:MM:SS" (camera local time), with an optional "+02:00" offset that pins it
 * to an instant. Without an offset the wall-clock time is read as local time on this phone.
 */
export function parseExifDate(s: string, offset?: string): number | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim());
  if (!m) return undefined;
  const [y, mo, d, h, mi, sec] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i] ?? 0)) as [number, number, number, number, number, number];
  if (!y || !mo || !d) return undefined; // "0000:00:00 00:00:00" means unset
  if (offset && /^[+-]\d{2}:\d{2}$/.test(offset.trim())) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${offset.trim()}`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : undefined;
  }
  const t = new Date(y, mo - 1, d, h, mi, sec).getTime();
  return Number.isFinite(t) ? t : undefined;
}

/** Find the TIFF block inside a JPEG's APP1 "Exif" segment. */
function tiffOffset(v: DataView): number | undefined {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return undefined;
  let p = 2;
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) return undefined;
    const marker = v.getUint8(p + 1);
    if (marker === 0xd9 || marker === 0xda) return undefined; // end of image / start of scan
    const len = v.getUint16(p + 2);
    if (marker === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966 && v.getUint16(p + 8) === 0) return p + 10;
    p += 2 + len;
  }
  return undefined;
}

/** Read the date tags from a JPEG's bytes. Returns undefined for anything that is not a JPEG with EXIF. */
export function exifCaptureTime(buf: ArrayBuffer): number | undefined {
  const v = new DataView(buf);
  const found = tiffOffset(v);
  if (found === undefined || found + 8 > v.byteLength) return undefined;
  const tiff = found;
  const order = v.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return undefined;
  const le = order === 0x4949;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  const inRange = (o: number, n: number) => o >= 0 && o + n <= v.byteLength;

  /** Tags of one IFD as {tag: value offset/count} for ASCII and LONG values. */
  function readIfd(start: number): Map<number, string | number> {
    const out = new Map<number, string | number>();
    if (!inRange(start, 2)) return out;
    const n = u16(start);
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12;
      if (!inRange(e, 12)) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      if (type === 4) out.set(tag, u32(e + 8)); // LONG (pointer to a sub-IFD)
      else if (type === 2 && count > 0 && count < 64) {
        const at = count <= 4 ? e + 8 : tiff + u32(e + 8);
        if (!inRange(at, count)) continue;
        let s = '';
        for (let j = 0; j < count; j++) {
          const c = v.getUint8(at + j);
          if (c === 0) break;
          s += String.fromCharCode(c);
        }
        out.set(tag, s);
      }
    }
    return out;
  }

  const ifd0 = readIfd(tiff + u32(tiff + 4));
  const exifPtr = ifd0.get(TAG_EXIF_IFD);
  const exif = typeof exifPtr === 'number' ? readIfd(tiff + exifPtr) : new Map<number, string | number>();
  const original = exif.get(TAG_DATETIME_ORIGINAL);
  const offset = exif.get(TAG_OFFSET_TIME_ORIGINAL);
  if (typeof original === 'string') {
    const t = parseExifDate(original, typeof offset === 'string' ? offset : undefined);
    if (t !== undefined) return t;
  }
  const changed = ifd0.get(TAG_DATETIME);
  return typeof changed === 'string' ? parseExifDate(changed) : undefined;
}

/** Capture time from EXIF if present, else the file date unless it is just the time of picking. */
export function choosePhotoTime(exifTime: number | undefined, lastModified: number | undefined, now: number): PhotoTime {
  if (exifTime !== undefined) return { time: exifTime, source: 'photo' };
  if (lastModified && lastModified > 0 && Math.abs(now - lastModified) > FRESH_COPY_MS) return { time: lastModified, source: 'file' };
  return { source: 'unknown' };
}

/** Browser glue: read the start of the file and decide. */
export async function readPhotoTime(file: File, now = Date.now()): Promise<PhotoTime> {
  let exif: number | undefined;
  try {
    exif = exifCaptureTime(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
  } catch {
    exif = undefined;
  }
  return choosePhotoTime(exif, file.lastModified, now);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Local time for the assistant, unambiguous and locale-free: "Thu 2026-10-15 19:42". */
export function fmtLocalDateTime(t: number): string {
  const d = new Date(t);
  return `${WEEKDAYS[d.getDay()]} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse "YYYY-MM-DD HH:MM" (local time), as the assistant writes meal times. */
export function parseLocalDateTime(s: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return undefined;
  const [y, mo, d, h, mi] = [1, 2, 3, 4, 5].map((i) => Number(m[i])) as [number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  // Reject rollovers such as 2026-02-31.
  if (date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return undefined;
  return date.getTime();
}

/** The line the assistant sees before a photo. */
export function photoLabel(n: number, pt: PhotoTime): string {
  if (pt.time === undefined) return `Photo ${n}: capture time unknown.`;
  return pt.source === 'photo'
    ? `Photo ${n}: taken ${fmtLocalDateTime(pt.time)} (from the photo's data).`
    : `Photo ${n}: file date ${fmtLocalDateTime(pt.time)} (no capture time in the photo; this may be when it was saved, not taken).`;
}
