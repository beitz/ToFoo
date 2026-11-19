import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { language, resolveLanguage, setLanguage, t } from './index';
import { en, type MessageKey } from './en';
import { de } from './de';
import { foodAltName, foodName, groupName } from './names';
import { FEATURES_DE, NUTRIENT_GROUPS_DE, NUTRIENT_NAMES_DE } from './names.de';
import { NUTRIENTS, NUTRIENT_BY_ID, NUTRIENT_GROUPS } from '../model/nutrients';
import { FEATURES } from '../settings/features';
import { MEASURES } from '../logic/insights';
import { fmtNumber, fmtNumberEn } from '../lib/format';
import { formatDay, weekdayShort } from '../lib/dates';

afterEach(() => setLanguage('en'));

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('language setting', () => {
  it('follows the phone only when set to automatic; installs from before stay English', () => {
    expect(resolveLanguage('auto', ['de-DE', 'en-US'])).toBe('de');
    expect(resolveLanguage('auto', ['de-AT'])).toBe('de');
    expect(resolveLanguage('auto', ['de'])).toBe('de');
    expect(resolveLanguage('auto', ['en-GB', 'de-DE'])).toBe('en');
    expect(resolveLanguage('auto', ['fr-FR'])).toBe('en');
    expect(resolveLanguage('auto', [])).toBe('en');
    expect(resolveLanguage(undefined, ['de-DE'])).toBe('en');
    expect(resolveLanguage('de', ['en-US'])).toBe('de');
    expect(resolveLanguage('en', ['de-DE'])).toBe('en');
  });

  it('switches strings, dates, numbers and names, and back', () => {
    setLanguage('de');
    expect(language()).toBe('de');
    expect(t('day.today')).toBe('Heute');
    expect(formatDay('2026-11-19', '2026-11-19')).toBe('Heute');
    expect(formatDay('2026-11-18', '2026-11-19')).toBe('Gestern');
    expect(weekdayShort('2026-11-19')).toBe('Do');
    expect(fmtNumber(1234.5, 1)).toBe('1.234,5');
    expect(fmtNumberEn(1234.5, 1)).toBe('1,234.5');
    expect(NUTRIENT_BY_ID.get('FE')!.name).toBe('Eisen');
    expect(NUTRIENT_GROUPS.trace).toBe('Spurenelemente');
    expect(FEATURES.find((f) => f.key === 'journal')!.label).toBe('Tagebuch');
    const apple = { nameEn: 'Apple, raw', nameDe: 'Apfel, roh' };
    expect(foodName(apple)).toBe('Apfel, roh');
    expect(foodAltName(apple)).toBe('Apple, raw');
    expect(groupName({ en: 'Fruit', de: 'Obst' })).toBe('Obst');

    setLanguage('en');
    expect(t('day.today')).toBe('Today');
    expect(formatDay('2026-11-19', '2026-11-19')).toBe('Today');
    expect(fmtNumber(1234.5, 1)).toBe('1,234.5');
    expect(NUTRIENT_BY_ID.get('FE')!.name).toBe('Iron');
    expect(FEATURES.find((f) => f.key === 'journal')!.label).toBe('Journal');
    expect(foodName(apple)).toBe('Apple, raw');
  });

  it('falls back to English for a string German lacks', () => {
    setLanguage('de');
    const missing = (Object.keys(en) as MessageKey[]).find((k) => de[k] === undefined);
    if (missing) expect(t(missing)).toBe(en[missing]);
  });
});

describe('German strings', () => {
  it('cover every English key', () => {
    expect((Object.keys(en) as MessageKey[]).filter((k) => !de[k])).toEqual([]);
  });

  it('split the ladder signs into as many parts as English', () => {
    const parts = (s: string) => s.split(' · ').length;
    const wrong = (Object.keys(en) as MessageKey[]).filter((k) => k.endsWith('.signs') && parts(de[k]) !== parts(en[k]));
    expect(wrong).toEqual([]);
  });

  it('use the same {placeholders} as English', () => {
    const wrong = (Object.keys(de) as MessageKey[]).filter((k) => placeholders(de[k]!).join() !== placeholders(en[k]).join());
    expect(wrong).toEqual([]);
  });

  it('name every nutrient, nutrient group and feature', () => {
    expect(NUTRIENTS.filter((n) => !NUTRIENT_NAMES_DE[n.id]).map((n) => n.id)).toEqual([]);
    expect(Object.keys(NUTRIENT_GROUPS).filter((g) => !NUTRIENT_GROUPS_DE[g])).toEqual([]);
    expect(FEATURES.filter((f) => !FEATURES_DE[f.key]).map((f) => f.key)).toEqual([]);
  });

  it('name every Patterns measure (nutrients go by their own name)', () => {
    expect(MEASURES.filter((m) => !NUTRIENT_BY_ID.has(m.id) && !(`measure.${m.id}` in en)).map((m) => m.id)).toEqual([]);
  });
});

describe('locale', () => {
  // Dates and numbers follow the UI language through lib/locale.ts; a fixed 'en-GB' would stay English
  // in German. Text for the assistant uses fmtNumberEn instead.
  it('is never fixed to en-GB in the UI code', () => {
    const root = resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(root);
    const allowed = ['lib/locale.ts', 'lib/format.ts', 'i18n/index.ts'];
    const fixed = files
      .filter((p) => !allowed.some((a) => p.endsWith(a)))
      .filter((p) => readFileSync(p, 'utf8').includes("'en-GB'"))
      .map((p) => p.slice(root.length + 1));
    expect(fixed).toEqual([]);
  });
});
