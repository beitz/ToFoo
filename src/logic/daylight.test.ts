import { describe, expect, it } from 'vitest';
import { daylight } from './daylight';
import { sunTimes } from '../model/sun';

const hm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

describe('sunTimes', () => {
  // Berlin (52.52° N, 13.40° E), as published (timeanddate.com, NOAA calculator): 04:43 / 21:33 CEST on 21 June, 08:15 / 15:54 CET on 21 December.
  it('matches published sunrise and sunset in Berlin', () => {
    const june = sunTimes(2026, 6, 21, 2, 52.52, 13.405);
    const dec = sunTimes(2026, 12, 21, 1, 52.52, 13.405);
    expect(hm(june.rise!)).toBe('04:43');
    expect(hm(june.set!)).toBe('21:33');
    expect(hm(dec.rise!)).toBe('08:15');
    expect(hm(dec.set!)).toBe('15:54');
  });

  it('knows days the sun never rises or never sets', () => {
    expect(sunTimes(2026, 12, 21, 1, 78, 15).allDay).toBe('down');
    expect(sunTimes(2026, 6, 21, 2, 78, 15).allDay).toBe('up');
  });
});

describe('daylight', () => {
  it('gives one span from sunrise to sunset on the local day', () => {
    const [span, ...rest] = daylight('2026-11-13', 51);
    expect(rest).toEqual([]);
    const rise = new Date(span!.start);
    const set = new Date(span!.end);
    expect(rise.getDate()).toBe(13);
    expect(set.getDate()).toBe(13);
    expect(span!.end - span!.start).toBeGreaterThan(8 * 3600e3);
    expect(span!.end - span!.start).toBeLessThan(10 * 3600e3);
  });

  it('is empty in a polar night and the whole day in a polar day', () => {
    expect(daylight('2026-12-21', 80)).toEqual([]);
    const [all] = daylight('2026-06-21', 80);
    expect(all!.end - all!.start).toBe(24 * 3600e3);
  });
});
