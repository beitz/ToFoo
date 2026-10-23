/**
 * Sources under the ⓘ texts of Home's three cards (owner's ask, 2026-10-23: a way to fact-check them, but only
 * where a good source exists). The store sizes and daily targets are read from model/, so a source changed
 * there shows here too; only the short labels live in this file. The 14-day window for some nutrients and the
 * arrows are modelling choices with no source to link, so they get none.
 */
import { referenceValues } from '../../model/reference-values';
import { energyNeed, storage } from '../../model/parameters';
import { NUTRIENT_BY_ID } from '../model/nutrients';
import type { InfoSource } from './nutrientInfo.en';

export const homeInfoEn = {
  'home.sources': 'Sources',
  'home.src.dailyNeed': 'daily needs',
  'home.src.ree': 'resting energy, for the estimate from your profile',
  'home.src.week': 'reference values need not be met every single day; reaching them on average over a week is enough (in German)',
  'home.src.store': 'store size: {list}',
  'home.src.more': 'Each nutrient’s page shows how its number is worked out, with its sources.',
} as const;

/** A source, with a few words on what it backs up where its title does not say. */
export interface HomeSource extends InfoSource {
  about?: string;
}

const dgeOverview: InfoSource = { label: 'DGE/ÖGE reference values for nutrient intake (2025)', url: 'https://www.dge.de/wissenschaft/referenzwerte/' };
const dgeFaq: InfoSource = {
  label: 'DGE (2018): FAQ on reference values, question 4',
  url: 'https://www.dge.de/fileadmin/dok/gesunde-ernaehrung/faq/DGE-FAQ-Referenzwerte_allgemein-2018.pdf',
};

/** Short labels for the store-size sources in model/parameters.ts, by URL. */
export const STORE_SOURCE_LABELS: Record<string, string> = {
  'https://doi.org/10.17226/6015': 'IOM (1998): Dietary Reference Intakes, B vitamins',
  'https://doi.org/10.17226/10026': 'IOM (2001): Dietary Reference Intakes, micronutrients',
  'https://doi.org/10.1093/ajcn/88.2.582S': 'Jones G (2008), Am J Clin Nutr: vitamin D pharmacokinetics',
  'https://ods.od.nih.gov/factsheets/Iodine-HealthProfessional/': 'NIH Office of Dietary Supplements: iodine fact sheet',
};

const refUrl = (id: string) => referenceValues.find((r) => r.nutrient === id)?.url;

/** The source URL of each body store's size, by nutrient. */
export function storeSourceUrls(): Array<[id: string, url: string | undefined]> {
  return Object.entries(storage).flatMap(([id, s]) =>
    s.kind === 'tank' ? [[id, s.capacity.url] as [string, string | undefined]] : s.kind === 'tankDays' ? [[id, s.capacityDays.url] as [string, string | undefined]] : [],
  );
}

type T = (key: keyof typeof homeInfoEn, vars?: Record<string, string>) => string;

export function todaySources(t: T): HomeSource[] {
  const dge = (id: string, name: string): HomeSource[] => {
    const url = refUrl(id);
    return url ? [{ label: `DGE/ÖGE reference values: ${name}`, url }] : [];
  };
  return [
    ...dge('ENERCC', 'energy'),
    ...(energyNeed.ree.url ? [{ label: 'Müller MJ et al. (2004), Am J Clin Nutr', url: energyNeed.ree.url, about: t('home.src.ree') }] : []),
    ...dge('PROT625', 'protein'),
    ...dge('FIBT', 'fibre'),
  ];
}

export function weekSources(t: T): HomeSource[] {
  return [
    { ...dgeFaq, about: t('home.src.week') },
    { ...dgeOverview, about: t('home.src.dailyNeed') },
  ];
}

/** One line per source of a store size, naming the stores it backs up, then the daily needs. */
export function storeSources(t: T): HomeSource[] {
  const byUrl = new Map<string, string[]>();
  for (const [id, url] of storeSourceUrls()) {
    if (!url || !STORE_SOURCE_LABELS[url]) continue;
    byUrl.set(url, [...(byUrl.get(url) ?? []), NUTRIENT_BY_ID.get(id)?.name ?? id]);
  }
  return [
    ...[...byUrl].map(([url, names]) => ({ label: STORE_SOURCE_LABELS[url]!, url, about: t('home.src.store', { list: names.join(', ') }) })),
    { ...dgeOverview, about: t('home.src.dailyNeed') },
  ];
}
