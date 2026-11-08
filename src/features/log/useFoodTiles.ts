import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { productLabel } from '../../foods/products';
import { normalize } from '../../foods/search';
import { dayKey } from '../../lib/dates';
import { refKey } from '../../lib/refs';
import { iconFor, monogram, shortNames, type FoodIconName } from '../../logic/foodIcons';
import { homeKindOf, type HomeKind } from '../../logic/homeKind';
import { repo } from '../../storage/repo';
import type { FoodRef, LogEntry } from '../../storage/types';
import { usePieceUnits } from '../pantry/usePantry';
import type { HomeTile } from './HomeTiles';
import { oneTapFor } from './oneTapEntry';
import { productTag } from './ProductList';
import type { HomePick } from './useHomeTiles';

/** Recent foods shown: two rows of five at 360 px. */
const RECENT_FOODS = 10;

interface Thing {
  key: string;
  name: string;
  detail: string;
  pick: HomePick;
  icon?: FoodIconName;
  kind?: HomeKind;
  english?: string;
}

/** The key of what a log entry is of, as favourites and tiles go by it; none for pots, drinks and manual entries. */
export function entryRefKey(e: LogEntry): string | undefined {
  return e.kind === 'food' ? refKey(e.ref) : e.kind === 'custom' ? refKey({ source: 'custom', id: e.customFoodId }) : undefined;
}

/**
 * Log meal's Favourites and Recent foods as tiles (owner's ask, 2026-11-08: "I'd like the rest to also
 * look like that"), the same as At home: a tap adds one (src/logic/oneTap.ts: one piece, else the
 * amount logged last time, else the label's serving; one serving of an own food), a hold opens the
 * amount sheet. Recent foods are what was logged last, foods, products and own foods alike, without
 * the favourites and what `skip` names (things at home, which have their own tiles). `query` keeps the
 * tiles whose name has every typed word.
 */
export function useFoodTiles({
  time,
  query,
  added,
  skip,
  onPick,
  onLogged,
}: {
  time: number;
  query: string;
  added: readonly LogEntry[];
  skip: ReadonlySet<string>;
  onPick: (pick: HomePick) => void;
  onLogged: (entry: LogEntry, message: string) => void;
}): { favourites: HomeTile[]; recent: HomeTile[] } {
  const d = useData();
  const units = usePieceUnits();
  const lastRows = useLiveQuery(() => repo.db.meta.where('key').startsWith('lastGrams:').toArray(), []);

  const { favourites, recent, lastLogged } = useMemo(() => {
    const thingOf = (ref: FoodRef): Thing | undefined => {
      const key = refKey(ref);
      if (ref.source === 'BLS') {
        const food = d.foods.byCode.get(ref.code);
        if (!food) return undefined;
        return { key, name: food.nameEn, detail: food.nameDe, pick: { kind: 'food', food }, icon: iconFor(food.nameEn, food.code) ?? iconFor(food.nameDe), kind: homeKindOf({ food }) };
      }
      if (ref.source === 'custom') {
        const food = d.customFoodsById.get(ref.id);
        if (!food) return undefined;
        return { key, name: food.name, detail: food.isSupplement ? t('log.supplement') : food.servingLabel, pick: { kind: 'custom', food }, icon: iconFor(food.name) };
      }
      const product = d.productsById.get(key);
      if (!product) return undefined;
      const match = product.match ? d.foods.byCode.get(product.match.code) : undefined;
      return {
        key,
        name: productLabel(product),
        detail: productTag(product),
        pick: { kind: 'product', product },
        icon: iconFor(product.name, product.match?.code),
        kind: homeKindOf({ product, ...(match ? { food: match } : {}) }),
        ...(match ? { english: match.nameEn } : {}),
      };
    };
    const favourites: Thing[] = [];
    for (const ref of d.settings.favourites ?? []) {
      const thing = thingOf(ref);
      if (thing) favourites.push(thing);
    }
    // Newest first; the grams logged last time stand in for one when a tap has none saved.
    const lastLogged = new Map<string, number>();
    const recent: Thing[] = [];
    const seen = new Set([...favourites.map((f) => f.key), ...skip]);
    for (const e of [...d.log].sort((a, b) => b.time - a.time)) {
      const key = entryRefKey(e);
      if (!key) continue;
      if (e.kind === 'food' && !lastLogged.has(key)) lastLogged.set(key, e.grams);
      if (seen.has(key) || recent.length >= RECENT_FOODS) continue;
      seen.add(key);
      const thing = e.kind === 'food' ? thingOf(e.ref) : e.kind === 'custom' ? thingOf({ source: 'custom', id: e.customFoodId }) : undefined;
      if (thing) recent.push(thing);
    }
    return { favourites, recent, lastLogged };
  }, [d.settings.favourites, d.log, d.foods, d.productsById, d.customFoodsById, skip]);

  // Short names are worked out over both rows at once, so two look-alikes get told apart.
  const shorts = useMemo(() => shortNames([...favourites, ...recent].map((x) => ({ id: x.key, name: x.name, icon: x.icon, ...(x.english ? { english: x.english } : {}) }))), [favourites, recent]);

  return useMemo(() => {
    const last = new Map((lastRows ?? []).map((r) => [r.key.slice('lastGrams:'.length), r.value as number]));
    const words = normalize(query).split(' ').filter(Boolean);
    const addedTimes = new Map<string, number>();
    for (const e of added) {
      const key = entryRefKey(e);
      if (key) addedTimes.set(key, (addedTimes.get(key) ?? 0) + (e.kind === 'food' ? (e.pieces ?? 1) : e.kind === 'custom' ? e.servings : 1));
    }
    const entryDay = dayKey(new Date(time));
    const tiles = (things: readonly Thing[]): HomeTile[] =>
      things
        .filter((x) => !words.length || words.every((w) => normalize(`${x.name} ${x.detail} ${shorts.get(x.key) ?? ''}`).includes(w)))
        .map((x) => {
          const short = shorts.get(x.key) ?? x.name;
          const lastKey = x.pick.kind === 'product' ? x.pick.product.id : x.pick.kind === 'food' ? x.pick.food.code : undefined;
          const one = oneTapFor(x.pick, { time, day: entryDay, foodsVersion: d.foods.version, units: units(x.key), lastGrams: (lastKey ? last.get(lastKey) : undefined) ?? lastLogged.get(x.key) });
          return {
            key: x.key,
            icon: x.icon,
            ...(x.kind ? { kind: x.kind } : {}),
            monogram: monogram(x.name),
            short,
            full: x.name,
            detail: x.detail,
            added: Math.round((addedTimes.get(x.key) ?? 0) * 10) / 10,
            onHold: () => onPick(x.pick),
            onTap: () => {
              if (!one) return onPick(x.pick);
              void one().then(({ entry, amount }) => onLogged(entry, t('log.addedOne', { name: short, amount })));
            },
          };
        });
    return { favourites: tiles(favourites), recent: tiles(recent) };
  }, [favourites, recent, lastLogged, shorts, lastRows, query, added, time, units, d.foods.version, onPick, onLogged]);
}
