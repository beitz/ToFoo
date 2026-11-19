/**
 * Names that come from data rather than the string tables: BLS food and group names (the BLS has
 * both languages) and the app's own nutrient, nutrient group and feature names (English in their
 * model and settings files, German in names.de.ts).
 */
import { NUTRIENTS, NUTRIENT_GROUPS } from '../model/nutrients';
import { FEATURES } from '../settings/features';
import type { Language } from './index';
import { FEATURES_DE, NUTRIENT_GROUPS_DE, NUTRIENT_NAMES_DE } from './names.de';

interface Named {
  nameEn: string;
  nameDe: string;
}

let lang: Language = 'en';

/** A BLS food's name in the UI language (English names first in English, German in German). */
export function foodName(f: Named): string;
export function foodName(f: Named | undefined): string | undefined;
export function foodName(f: Named | undefined): string | undefined {
  return f && (lang === 'de' ? f.nameDe : f.nameEn);
}

/** The food's name in the other language, shown small under it (and searched too). */
export function foodAltName(f: Named): string {
  return lang === 'de' ? f.nameEn : f.nameDe;
}

/** A BLS food group's name in the UI language. */
export function groupName(g: { en: string; de: string }): string;
export function groupName(g: { en: string; de: string } | undefined): string | undefined;
export function groupName(g: { en: string; de: string } | undefined): string | undefined {
  return g && (lang === 'de' ? g.de : g.en);
}

/** The other language's group name. */
export function groupAltName(g: { en: string; de: string }): string {
  return lang === 'de' ? g.en : g.de;
}

// The English originals, taken once, so switching back restores them.
const NUTRIENT_EN = new Map(NUTRIENTS.map((n) => [n.id, { name: n.name, short: n.short }]));
const GROUPS_EN = { ...NUTRIENT_GROUPS };
const FEATURES_EN = new Map(FEATURES.map((f) => [f.key, { label: f.label, description: f.description }]));

/**
 * Called by setLanguage. Nutrient and feature names are read in many places straight off their
 * definitions (def.name, f.label), so they are switched in place rather than looked up at each one;
 * nothing in the model reads them, they are display text only.
 */
export function applyNames(next: Language): void {
  lang = next;
  for (const n of NUTRIENTS) {
    const en = NUTRIENT_EN.get(n.id)!;
    const de = next === 'de' ? NUTRIENT_NAMES_DE[n.id] : undefined;
    n.name = de?.[0] ?? en.name;
    n.short = de?.[1] ?? en.short;
  }
  for (const k of Object.keys(GROUPS_EN)) NUTRIENT_GROUPS[k] = (next === 'de' ? NUTRIENT_GROUPS_DE[k] : undefined) ?? GROUPS_EN[k]!;
  for (const f of FEATURES) {
    const en = FEATURES_EN.get(f.key)!;
    const de = next === 'de' ? FEATURES_DE[f.key] : undefined;
    f.label = de?.label ?? en.label;
    f.description = de?.description ?? en.description;
  }
}
