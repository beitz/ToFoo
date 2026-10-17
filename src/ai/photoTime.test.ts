import { describe, expect, it } from 'vitest';
import { choosePhotoTime, exifCaptureTime, parseExifDate, photoLabel } from './photoTime';

/** A minimal JPEG: SOI, an APP1 Exif segment with IFD0 (DateTime, Exif pointer) and an Exif IFD. */
function jpegWithExif(opts: { littleEndian: boolean; original?: string; offset?: string; modified?: string }): ArrayBuffer {
  const le = opts.littleEndian;
  const tiff: number[] = [];
  const u16 = (n: number) => (le ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) => (le ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);

  // Layout: header (8) | IFD0 at 8 | Exif IFD | string data.
  const ifd0Entries = (opts.modified ? 1 : 0) + 1;
  const exifEntries = (opts.original ? 1 : 0) + (opts.offset ? 1 : 0);
  const ifd0At = 8;
  const exifAt = ifd0At + 2 + ifd0Entries * 12 + 4;
  let dataAt = exifAt + 2 + exifEntries * 12 + 4;
  const data: number[] = [];
  const str = (s: string) => {
    const at = dataAt + data.length;
    data.push(...ascii(s));
    return at;
  };
  const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...value];

  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0At));
  tiff.push(...u16(ifd0Entries));
  if (opts.modified) tiff.push(...entry(0x0132, 2, opts.modified.length + 1, u32(str(opts.modified))));
  tiff.push(...entry(0x8769, 4, 1, u32(exifAt)), ...u32(0));
  tiff.push(...u16(exifEntries));
  if (opts.original) tiff.push(...entry(0x9003, 2, opts.original.length + 1, u32(str(opts.original))));
  if (opts.offset) tiff.push(...entry(0x9011, 2, opts.offset.length + 1, u32(str(opts.offset))));
  tiff.push(...u32(0), ...data);

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  // An APP0 segment first, as many cameras write, to check the segment walk.
  const app0 = [0xff, 0xe0, 0, 4, 0, 0];
  return new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xd9]).buffer;
}

describe('photo capture time', () => {
  it('reads DateTimeOriginal in both byte orders, as local time', () => {
    const local = new Date(2026, 9, 15, 19, 42, 5).getTime();
    expect(exifCaptureTime(jpegWithExif({ littleEndian: true, original: '2026:10:15 19:42:05' }))).toBe(local);
    expect(exifCaptureTime(jpegWithExif({ littleEndian: false, original: '2026:10:15 19:42:05', modified: '2026:10:16 08:00:00' }))).toBe(local);
  });

  it('uses the time zone offset when the camera wrote one', () => {
    expect(exifCaptureTime(jpegWithExif({ littleEndian: true, original: '2026:10:15 19:42:05', offset: '+02:00' }))).toBe(Date.parse('2026-10-15T17:42:05Z'));
  });

  it('falls back to the IFD0 date, and gives up on non-JPEGs and unset dates', () => {
    expect(exifCaptureTime(jpegWithExif({ littleEndian: true, modified: '2026:10:16 08:00:00' }))).toBe(new Date(2026, 9, 16, 8).getTime());
    expect(exifCaptureTime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeUndefined();
    expect(exifCaptureTime(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeUndefined();
    expect(parseExifDate('0000:00:00 00:00:00')).toBeUndefined();
    expect(parseExifDate('garbage')).toBeUndefined();
  });

  it('prefers EXIF, then a file date unless it is just the moment of picking', () => {
    const now = Date.parse('2026-10-17T08:00:00Z');
    expect(choosePhotoTime(1, now - 86_400_000, now)).toEqual({ time: 1, source: 'photo' });
    expect(choosePhotoTime(undefined, now - 86_400_000, now)).toEqual({ time: now - 86_400_000, source: 'file' });
    expect(choosePhotoTime(undefined, now - 30_000, now)).toEqual({ source: 'unknown' });
    expect(choosePhotoTime(undefined, 0, now)).toEqual({ source: 'unknown' });
  });

  it('labels photos for the assistant, saying where the time came from', () => {
    const t = new Date(2026, 9, 15, 19, 42).getTime();
    expect(photoLabel(3, { time: t, source: 'photo' })).toBe("Photo 3: taken Thu 2026-10-15 19:42 (from the photo's data).");
    expect(photoLabel(4, { time: t, source: 'file' })).toContain('file date Thu 2026-10-15 19:42 (no capture time');
    expect(photoLabel(5, { source: 'unknown' })).toBe('Photo 5: capture time unknown.');
  });
});
