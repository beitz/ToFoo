import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import type { Settings } from '../../storage/types';
import { MAX_TOUR_LINE, pendingTour, tourForRoute, TOURS, TOUR_IDS } from './tours';
import { SAMPLE_CODES, SAMPLE_DAYS, sampleDayStatus, sampleLog } from './sample';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') && name !== 'tours.ts' ? [path] : [];
  });
}

describe('tours', () => {
  const source = sourceFiles(join(__dirname, '../..'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const steps = TOUR_IDS.flatMap((id) => TOURS[id].steps.map((s) => ({ id, ...s })));

  it('point only at markers that exist on some screen', () => {
    // A card that was removed or renamed would otherwise leave a step that is silently always skipped.
    const missing = steps.filter((s) => s.target && !source.includes(`"${s.target}"`) && !source.includes(`'${s.target}'`)).map((s) => `${s.id}: ${s.target}`);
    expect(missing).toEqual([]);
  });

  it('have one short English line per step', () => {
    for (const s of steps) {
      const line = en[s.text];
      expect(line, s.text).toBeTruthy();
      expect(line.length, s.text).toBeLessThanOrEqual(MAX_TOUR_LINE);
    }
  });
});

describe('which tour runs', () => {
  const features = { aiAssistant: true } as Settings['features'];
  const fresh = { toursSeen: [], features };
  it('belongs to the screen', () => {
    expect(tourForRoute([])).toBe('home');
    expect(tourForRoute(['overview'])).toBe('insights');
    expect(tourForRoute(['kitchen'])).toBe('kitchen');
    expect(tourForRoute(['settings'])).toBe('settings');
    expect(tourForRoute(['settings', 'profile'])).toBeUndefined();
    expect(tourForRoute(['assistant'])).toBe('assistant');
    expect(tourForRoute(['assistant', 'chat', 'x'])).toBeUndefined();
    expect(tourForRoute(['nutrient', 'FE'])).toBe('nutrient');
    expect(tourForRoute(['nutrient', 'FE', 'why'])).toBeUndefined();
    expect(tourForRoute(['diary', '2026-10-20'])).toBeUndefined();
  });

  it('waits for the first-launch sheets, runs once, and never on an install from before the tours', () => {
    expect(pendingTour([], fresh, false, false, new Set())).toBeUndefined();
    expect(pendingTour([], fresh, true, false, new Set())).toBe('home');
    expect(pendingTour([], { toursSeen: ['home'], features }, true, false, new Set())).toBeUndefined();
    expect(pendingTour([], fresh, true, false, new Set(['home']))).toBeUndefined();
    expect(pendingTour([], { features }, true, false, new Set())).toBeUndefined();
  });

  it("waits for the assistant to be on before explaining it", () => {
    expect(pendingTour(['assistant'], fresh, true, false, new Set())).toBe('assistant');
    expect(pendingTour(['assistant'], { toursSeen: [], features: { ...features, aiAssistant: false } }, true, false, new Set())).toBeUndefined();
  });

  it("starts the round button's tour when its menu opens", () => {
    expect(pendingTour(['kitchen'], fresh, true, true, new Set())).toBe('fan');
    expect(pendingTour(['kitchen'], { toursSeen: ['fan'], features }, true, true, new Set())).toBe('kitchen');
  });
});

describe('the sample week', () => {
  const file = resolve(__dirname, '../../../public/data/bls-4.0.json');
  it.runIf(existsSync(file))('uses only foods in the bundled BLS file', () => {
    const codes = new Set((JSON.parse(readFileSync(file, 'utf8')) as { foods: Array<[string]> }).foods.map((f) => f[0]));
    expect(SAMPLE_CODES.filter((c) => !codes.has(c))).toEqual([]);
  });

  it('covers the last seven days and nothing in the future', () => {
    const now = new Date(2026, 9, 23, 10, 0).getTime();
    const log = sampleLog('2026-10-23', '4.0', now);
    expect(new Set(log.map((e) => e.day)).size).toBe(SAMPLE_DAYS + 1);
    expect(log.every((e) => e.time <= now)).toBe(true);
    expect(log.filter((e) => e.day === '2026-10-23').length).toBeGreaterThan(0);
    expect(log.every((e) => e.id.startsWith('sample-'))).toBe(true);
    expect(sampleDayStatus('2026-10-23').map((s) => s.day)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  });
});
