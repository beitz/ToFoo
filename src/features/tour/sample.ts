import { t, type MessageKey } from '../../i18n';
import { addDays, parseDay } from '../../lib/dates';
import type { Preparation } from '../../model/paramTypes';
import type { DayStatusRecord, LogEntry, Recipe } from '../../storage/types';
import { CURRENT_SCHEMA_VERSION } from '../../storage/types';

/**
 * The sample week the Home and Insights tours show (owner's pick over an empty screen, 2026-10-23):
 * ordinary meals from real BLS foods, so every number on screen is computed by the real model. It
 * lives in memory only: never stored, never in backups, never mixed with the user's entries.
 */

type Item = [code: string, grams: number, preparation?: Preparation];
type Meal = { hour: number; label: MessageKey; items: Item[] };

const BREAKFAST_OATS: Meal = {
  hour: 7.5,
  label: 'tour.sample.oats',
  items: [
    ['C133000', 60],
    ['M111300', 200],
    ['F503100', 120],
  ],
};

/** Three days that repeat, different enough to give some nutrients a gap and others plenty. */
const DAYS: Meal[][] = [
  [
    BREAKFAST_OATS,
    {
      hour: 12.5,
      label: 'tour.sample.bread',
      items: [
        ['B106000', 100],
        ['M402600', 40],
        ['G561100', 120],
      ],
    },
    {
      hour: 19,
      label: 'tour.sample.lentils',
      items: [
        ['H730132', 200],
        ['G211100', 100, 'steamed'],
        ['G620100', 100],
        ['Q120000', 10],
        ['C359032', 150],
      ],
    },
  ],
  [
    {
      hour: 8,
      label: 'tour.sample.yogurt',
      items: [
        ['M141300', 150],
        ['C512600', 50],
        ['F110100', 150],
      ],
    },
    {
      hour: 13,
      label: 'tour.sample.potatoes',
      items: [
        ['K110132', 250],
        ['Y740162', 100],
        ['G312100', 150, 'boiled'],
      ],
    },
    {
      hour: 19.5,
      label: 'tour.sample.salmon',
      items: [
        ['Y640312', 150],
        ['C359032', 150],
        ['G543100', 100],
      ],
    },
  ],
  [
    BREAKFAST_OATS,
    {
      hour: 12,
      label: 'tour.sample.chicken',
      items: [
        ['V4A6100', 150, 'fried'],
        ['H742132', 150],
        ['G480100', 50, 'fried'],
      ],
    },
    {
      hour: 18.5,
      label: 'tour.sample.rye',
      items: [
        ['B226000', 120],
        ['F603100', 150],
        ['H120100', 25],
        ['H310100', 20],
      ],
    },
  ],
];

/** Every BLS food the sample uses (checked against the bundled file by a test). */
export const SAMPLE_CODES = [...new Set([...DAYS.flat().flatMap((m) => m.items.map(([code]) => code)), 'H725100', 'G211100', 'G620100', 'G480100', 'Q120000'])];

export const SAMPLE_DAYS = 7;

/** A clock time on a day, in local time (parseDay gives noon). */
function timeOf(day: string, hour: number): number {
  const d = parseDay(day);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d.getTime();
}

/**
 * The sample log: the last seven days in full and today's breakfast once it is past (at a time in
 * the past, so nothing is "in the future"). `now` is passed in, so the result is the same for the
 * same moment.
 */
export function sampleLog(today: string, version: string, now: number): LogEntry[] {
  const out: LogEntry[] = [];
  for (let back = SAMPLE_DAYS; back >= 0; back--) {
    const day = addDays(today, -back);
    const meals = DAYS[back % DAYS.length]!;
    for (const meal of meals) {
      const time = timeOf(day, meal.hour);
      if (time > now) continue;
      meal.items.forEach(([code, grams, preparation], i) => {
        out.push({
          id: `sample-${day}-${meal.hour}-${i}`,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          kind: 'food',
          ref: { source: 'BLS', version, code },
          grams,
          preparation: preparation ?? 'asListed',
          time,
          day,
          confidence: 'A',
          label: t(meal.label),
        });
      });
    }
  }
  return out;
}

/** The finished sample days count as complete, as the user would mark them. */
export function sampleDayStatus(today: string): DayStatusRecord[] {
  return Array.from({ length: SAMPLE_DAYS }, (_, i) => ({ schemaVersion: CURRENT_SCHEMA_VERSION, day: addDays(today, -SAMPLE_DAYS + i), status: 'logged' as const }));
}

/** One sample recipe, so "Next to cook" has something to suggest. */
export function sampleRecipe(version: string, now: number): Recipe {
  const ing = (code: string, name: string, grams: number, preparation: Preparation = 'asListed') => ({ ref: { source: 'BLS' as const, version, code }, name, grams, preparation });
  return {
    id: 'sample-recipe',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: t('tour.sample.recipe'),
    portions: 4,
    ingredients: [
      ing('H725100', 'Lentil mature', 250, 'boiled'),
      ing('G211100', 'Spinach raw', 300, 'boiled'),
      ing('G620100', 'Carrot raw', 200, 'boiled'),
      ing('G480100', 'Onion raw', 100, 'fried'),
      ing('Q120000', 'Olive oil', 20),
    ],
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}
