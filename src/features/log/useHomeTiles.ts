import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { productLabel, productRef } from '../../foods/products';
import { normalize } from '../../foods/search';
import { dayKey } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { refKey } from '../../lib/refs';
import { iconFor, monogram, shortNames, type FoodIconName } from '../../logic/foodIcons';
import { oneOf, type OneOf } from '../../logic/oneTap';
import { loggable } from '../../logic/pantry';
import { portionGrams } from '../../logic/batch';
import { bookingSlot, nextStorage } from '../../logic/stock';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import type { Batch, CustomFood, FoodRef, LogEntry, Product } from '../../storage/types';
import { leftLabel, placeName, usePantry, usePantryLeft, usePieceUnits } from '../pantry/usePantry';
import { totalLeft } from '../home/StockChips';
import type { HomeTile } from './HomeTiles';

/** What a hold opens (the sheets a tap opened before), and a first tap when no amount is known yet. */
export type HomePick = { kind: 'food'; food: Food } | { kind: 'product'; product: Product } | { kind: 'custom'; food: CustomFood } | { kind: 'portion'; batch: Batch };

/** "Most eaten first" counts what was logged over this many days. */
const EATEN_DAYS = 28;
const DAY_MS = 86_400_000;

interface Thing {
  key: string;
  name: string;
  icon?: FoodIconName;
  english?: string;
  detail: string;
  pick: HomePick;
  /** What eating it counts as, for "most eaten first" and "+1": a food's key, or a pot's batch. */
  eatenKey: string;
  /** Adds one of it right away; undefined when the sheet has to ask first. */
  one?: () => Promise<{ entry: LogEntry; amount: string }>;
}

/**
 * The Log screen's At home section as tiles: cooked pots, then the foods at home that can be logged
 * (not used up, not spices), most eaten over the last four weeks first. Tapping adds one (src/logic/oneTap.ts)
 * at the meal's time; `query` keeps only the tiles whose name has every typed word.
 */
export function useHomeTiles({ day, time, query, added, onPick, onLogged }: { day: string; time: number; query: string; added: readonly LogEntry[]; onPick: (pick: HomePick) => void; onLogged: (entry: LogEntry, message: string) => void }) {
  const d = useData();
  const atHomeOn = isOn(d.settings.features, 'atHome');
  const pantry = usePantry();
  const left = usePantryLeft();
  const units = usePieceUnits();
  const lastRows = useLiveQuery(() => repo.db.meta.where('key').startsWith('lastGrams:').toArray(), []);

  const things = useMemo(() => {
    const last = new Map((lastRows ?? []).map((r) => [r.key.slice('lastGrams:'.length), r.value as number]));
    const out: Thing[] = [];
    const entryDay = dayKey(new Date(time));

    for (const b of d.batches) {
      if (totalLeft(b) <= 0) continue;
      const storage = nextStorage(b, day);
      const name = b.recipe.name;
      out.push({
        key: `batch:${b.id}`,
        name,
        icon: iconFor(name) ?? 'pot-of-food',
        detail: t('stock.left', { n: totalLeft(b) }),
        pick: { kind: 'portion', batch: b },
        eatenKey: `batch:${b.id}`,
        one: storage
          ? async () => {
              const per = portionGrams(b);
              const grams = per ? Math.round(per) : undefined;
              const entry = await repo.addLog({ kind: 'portion', batchId: b.id, storage: bookingSlot(b, storage), portions: 1, ...(grams && b.cookedGrams ? { grams } : {}), time, day: entryDay, confidence: 'A', label: name });
              return { entry, amount: t('log.onePortion') };
            }
          : undefined,
      });
    }

    if (atHomeOn) {
      for (const item of pantry ?? []) {
        const l = left(item);
        if (!loggable(item, l) || !item.ref) continue;
        const ref: FoodRef = item.ref;
        const detail = [leftLabel(item, l), placeName(item.place)].filter(Boolean).join(' · ');
        const base = { key: item.id, name: item.name, detail, eatenKey: refKey(ref) };
        if (ref.source === 'custom') {
          const food = d.customFoodsById.get(ref.id);
          if (!food) continue;
          out.push({
            ...base,
            icon: iconFor(item.name),
            pick: { kind: 'custom', food },
            one: async () => {
              const entry = await repo.addLog({ kind: 'custom', customFoodId: food.id, servings: 1, time, day: entryDay, confidence: food.confidence, label: food.name });
              return { entry, amount: t('log.oneServing', { serving: food.servingLabel }) };
            },
          });
          continue;
        }
        const product = ref.source === 'BLS' ? undefined : d.productsById.get(refKey(ref));
        const food = ref.source === 'BLS' ? d.foods.byCode.get(ref.code) : undefined;
        if (!product && !food) continue;
        const code = product?.match?.code ?? food?.code;
        const linked = code ? d.foods.byCode.get(code) : undefined;
        // Products' last amount and piece weights go by the product's id, BLS foods' by their code.
        const lastKey = product ? product.id : food!.code;
        const amount = oneOf({ countedInPieces: item.pieces !== undefined, units: units(refKey(ref)), lastGrams: last.get(lastKey), servingGrams: product?.serving?.grams });
        const label = product ? productLabel(product) : food!.nameEn;
        out.push({
          ...base,
          icon: iconFor(item.name, code),
          english: linked?.nameEn,
          pick: product ? { kind: 'product', product } : { kind: 'food', food: food! },
          one: amount
            ? async () => {
                const entry = await repo.addLog({ kind: 'food', ref: product ? productRef(product) : { source: 'BLS', version: d.foods.version, code: food!.code }, grams: amount.grams, preparation: 'asListed', ...(amount.pieces ? { pieces: amount.pieces } : {}), time, day: entryDay, confidence: 'A', label });
                await repo.setMeta(`lastGrams:${lastKey}`, amount.grams);
                return { entry, amount: amountText(amount) };
              }
            : undefined,
        });
      }
    }

    // Most eaten first: log entries over the last four weeks; pots by their batch.
    const since = time - EATEN_DAYS * DAY_MS;
    const eaten = new Map<string, number>();
    for (const e of d.log) {
      if (e.time < since) continue;
      const key = e.kind === 'food' ? refKey(e.ref) : e.kind === 'custom' ? refKey({ source: 'custom', id: e.customFoodId }) : e.kind === 'portion' ? `batch:${e.batchId}` : undefined;
      if (key) eaten.set(key, (eaten.get(key) ?? 0) + 1);
    }
    return out.sort((a, b) => (eaten.get(b.eatenKey) ?? 0) - (eaten.get(a.eatenKey) ?? 0) || a.name.localeCompare(b.name));
    // left() changes with the log, which d.log covers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atHomeOn, pantry, lastRows, units, d.log, d.batches, d.foods, d.customFoodsById, d.productsById, day, time]);

  const shorts = useMemo(() => shortNames(things.map((x) => ({ id: x.key, name: x.name, icon: x.icon, english: x.english }))), [things]);

  const tiles: HomeTile[] = useMemo(() => {
    const words = normalize(query).split(' ').filter(Boolean);
    const addedTimes = new Map<string, number>();
    for (const e of added) {
      const key = e.kind === 'food' ? refKey(e.ref) : e.kind === 'custom' ? refKey({ source: 'custom', id: e.customFoodId }) : e.kind === 'portion' ? `batch:${e.batchId}` : undefined;
      if (key) addedTimes.set(key, (addedTimes.get(key) ?? 0) + (e.kind === 'food' ? (e.pieces ?? 1) : e.kind === 'portion' ? e.portions : e.kind === 'custom' ? e.servings : 1));
    }
    return things
      .filter((x) => {
        if (!words.length) return true;
        const text = normalize(`${x.name} ${shorts.get(x.key) ?? ''} ${x.english ?? ''}`);
        return words.every((w) => text.includes(w));
      })
      .map((x) => {
        const short = shorts.get(x.key) ?? x.name;
        return {
          key: x.key,
          icon: x.icon,
          monogram: monogram(x.name),
          short,
          full: x.name,
          detail: x.detail,
          added: Math.round((addedTimes.get(x.eatenKey) ?? 0) * 10) / 10,
          onHold: () => onPick(x.pick),
          onTap: () => {
            if (!x.one) return onPick(x.pick);
            void x.one().then(({ entry, amount }) => onLogged(entry, t('log.addedOne', { name: short, amount })));
          },
        };
      });
  }, [things, shorts, query, added, onPick, onLogged]);

  return tiles;
}

/** The amount one tap added, as the toast says it: "1 piece (60 g)", "1 pack (350 g)", "60 g". */
function amountText(one: OneOf): string {
  const g = `${fmtNumber(one.grams, 1)} g`;
  if (one.what === 'piece') return t('log.onePiece', { g });
  if (one.what === 'pack') return t('log.onePack', { g });
  if (one.what === 'serving') return t('log.oneLabelServing', { g });
  return g;
}
