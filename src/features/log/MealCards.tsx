import { useState, type ReactNode } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { daysBetween, formatDate, formatDateTime, formatDay, formatTime, weekdayShort } from '../../lib/dates';
import { refKey } from '../../lib/refs';
import { iconFor, monogram, plainName, type FoodIconName } from '../../logic/foodIcons';
import { pickFromMeal, repeatAmount, type RepeatUnit } from '../../logic/repeat';
import type { FavouriteMeal, LogEntry } from '../../storage/types';
import { NumberInput, Sheet } from '../../ui/controls';
import { FoodIcon } from '../../ui/FoodIcon';
import { Icon } from '../../ui/Icon';
import { entryAmount } from './describe';
import { useHoldPress } from './HomeTiles';

/** Icons drawn on a meal's card; more items show as "+2". */
const MEAL_ICONS = 3;

export interface MealCard {
  key: string;
  meal: LogEntry[];
  /** "Yesterday 19:08", or "3 items" for a favourite. */
  when: string;
  /** Set for a pinned meal. */
  fav?: FavouriteMeal;
}

type AppData = ReturnType<typeof useData>;

/** The picture of one item of a meal: its food's icon, a pot's recipe, tea or coffee; else two letters. */
export function entryIcon(e: LogEntry, d: Pick<AppData, 'productsById' | 'batchesById'>): FoodIconName | undefined {
  switch (e.kind) {
    case 'food': {
      const code = e.ref.source === 'BLS' ? e.ref.code : e.ref.source === 'custom' ? undefined : d.productsById.get(refKey(e.ref))?.match?.code;
      return iconFor(e.label, code);
    }
    case 'portion':
      return iconFor(d.batchesById.get(e.batchId)?.recipe.name ?? e.label) ?? 'pot-of-food';
    case 'drink':
      return e.drink === 'tea' ? 'teacup-without-handle' : 'hot-beverage';
    default:
      return iconFor(e.label);
  }
}

/** When a past meal was eaten, short enough for a card at 360 px: "Today 08:10", "Sat 19:08" in the last week, else "28.10. 12:00". */
export function mealWhen(e: Pick<LogEntry, 'day' | 'time'>, today: string): string {
  const day = e.day === today ? formatDay(e.day, today) : daysBetween(e.day, today) < 7 ? weekdayShort(e.day) : formatDate(e.day, false);
  return `${day} ${formatTime(e.time)}`;
}

/**
 * Meals as small cards with the icons of what was in them (owner's ask, 2026-11-08: the Log screen
 * as pictures, not a wall of text): a meal never looks like a single food. A tap logs the whole meal
 * again; a hold shows what is in it, to log all or part of it again, and the favourite star.
 */
export function MealCards({ cards, onRepeat, onHold }: { cards: readonly MealCard[]; onRepeat: (meal: LogEntry[]) => void; onHold: (card: MealCard) => void }) {
  return (
    <ul className="meal-cards">
      {cards.map((c) => (
        <li key={c.key}>
          <Card card={c} onRepeat={onRepeat} onHold={onHold} />
        </li>
      ))}
    </ul>
  );
}

/** What an item weighs, so a card names the main dish first ("Pizza, Lemon"). */
// A pot's portion without grams is the main dish.
const weight = (e: LogEntry) => (e.kind === 'food' ? e.grams : e.kind === 'portion' ? (e.grams ?? Number.MAX_SAFE_INTEGER) : 0);

function Card({ card, onRepeat, onHold }: { card: MealCard; onRepeat: (meal: LogEntry[]) => void; onHold: (card: MealCard) => void }) {
  const d = useData();
  const items = [...card.meal].sort((a, b) => weight(b) - weight(a));
  const press = useHoldPress(
    () => onRepeat(card.meal),
    () => onHold(card),
  );
  const names = items.map((e) => plainName(e.label)).join(', ');
  const more = card.meal.length - MEAL_ICONS;
  return (
    <button type="button" className="meal-card" aria-label={`${t('log.mealCardLabel', { names: card.meal.map((e) => e.label).join(', ') })}, ${card.when}`} aria-describedby="log-meals-hint" {...press}>
      <span className="meal-card-icons" aria-hidden>
        {items.slice(0, MEAL_ICONS).map((e) => (
          <FoodIcon key={e.id} icon={entryIcon(e, d)} monogram={monogram(e.label)} size={34} />
        ))}
        {more > 0 && <span className="meal-card-more">+{more}</span>}
      </span>
      <span className="meal-card-name" aria-hidden>
        {names}
      </span>
      <span className="meal-card-when" aria-hidden>
        {card.fav && <Icon name="star" size={12} filled />} {card.when}
      </span>
    </button>
  );
}

/** The suffix of an item's amount field: grams, pieces, or a count of portions or servings. */
const unitSuffix = (unit: RepeatUnit) => (unit === 'g' ? 'g' : unit === 'pieces' ? t('piece.pcs') : '×');

/**
 * A past meal to log again, all of it or part of it (owner's ask, 2026-11-11: "I had a large meal on
 * Sunday and I'm eating leftovers now; I wanted to log just the soup"). Every item starts ticked with
 * the amount it had; untick what is not eaten again and change an amount where it differs. A hold on
 * a meal's card opens it on the Log screen, "Log again" on a meal in the diary too.
 */
export function MealSheet({ title, meal, time, onLog, onClose, actions }: { title: string; meal: readonly LogEntry[]; time: number; onLog: (picked: LogEntry[]) => void; onClose: () => void; actions?: ReactNode }) {
  const d = useData();
  const [on, setOn] = useState<ReadonlySet<string>>(() => new Set(meal.map((e) => e.id)));
  const [amounts, setAmounts] = useState<Readonly<Record<string, number | undefined>>>(() => Object.fromEntries(meal.map((e) => [e.id, repeatAmount(e)?.value])));
  const picked = meal.filter((e) => on.has(e.id));
  const valid = picked.length > 0 && picked.every((e) => !repeatAmount(e) || (amounts[e.id] ?? 0) > 0);
  const whole = picked.length === meal.length && meal.every((e) => amounts[e.id] === repeatAmount(e)?.value);
  function toggle(id: string, tick: boolean) {
    setOn((s) => {
      const next = new Set(s);
      if (tick) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted small">{t('repeat.pickHint')}</p>
      <ul className="plain-list meal-sheet-items">
        {meal.map((e) => {
          const amount = repeatAmount(e);
          const ticked = on.has(e.id);
          return (
            <li key={e.id} className={`meal-sheet-item${ticked ? '' : ' off'}`}>
              <label className="meal-sheet-pick">
                <input type="checkbox" checked={ticked} onChange={(ev) => toggle(e.id, ev.target.checked)} />
                <FoodIcon icon={entryIcon(e, d)} monogram={monogram(e.label)} size={36} />
                <span className="meal-sheet-text">
                  <span className="meal-sheet-name">{e.label}</span>
                  <span className="muted small">{entryAmount(e, d)}</span>
                </span>
              </label>
              {amount && ticked && (
                <div className="meal-sheet-amount">
                  <label className="visually-hidden" htmlFor={`again-${e.id}`}>
                    {t('repeat.amountLabel', { name: e.label })}
                  </label>
                  <NumberInput id={`again-${e.id}`} value={amounts[e.id]} onChange={(v) => setAmounts((a) => ({ ...a, [e.id]: v }))} suffix={unitSuffix(amount.unit)} min={0} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small">{t('repeat.atTime', { time: formatDateTime(time, d.today) })}</p>
      <div className="row wrap">
        <button type="button" className="btn btn-primary" disabled={!valid} onClick={() => onLog(pickFromMeal(meal, new Map(picked.map((e) => [e.id, amounts[e.id]])), d.batchesById))}>
          <Icon name="repeat" /> {whole ? t('log.logAgain') : t('repeat.logPicked', { n: picked.length, total: meal.length })}
        </button>
        {actions}
      </div>
    </Sheet>
  );
}

/** The favourite star in a meal's sheet on the Log screen. */
export function MealStar({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`btn btn-ghost fav-btn${pinned ? ' on' : ''}`} aria-pressed={pinned} onClick={onToggle}>
      <Icon name="star" size={18} filled={pinned} /> {pinned ? t('fav.on') : t('fav.add')}
    </button>
  );
}
