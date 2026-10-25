import { useMemo } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { refKey } from '../../lib/refs';
import { favouriteAsMeal, favouriteFromMeal, mealSignature } from '../../logic/repeat';
import { repo } from '../../storage/repo';
import type { FavouriteMeal, FoodRef, LogEntry } from '../../storage/types';
import { Icon } from '../../ui/Icon';

/**
 * Pin a food to the top of the log screen. The label says the state, so it never rests on the star's fill alone.
 * `prepare` runs before pinning: a product just scanned is saved first, or the favourite would point at nothing.
 */
export function FavouriteButton({ foodRef, prepare }: { foodRef: FoodRef; prepare?: () => Promise<void> }) {
  const d = useData();
  const key = refKey(foodRef);
  const on = (d.settings.favourites ?? []).some((r) => refKey(r) === key);
  async function toggle() {
    if (!on) await prepare?.();
    await repo.toggleFavourite(foodRef);
  }
  return (
    <button className={`btn btn-small btn-ghost fav-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => void toggle()}>
      <Icon name="star" size={18} filled={on} /> {on ? t('fav.on') : t('fav.add')}
    </button>
  );
}

/** The same toggle as a star at the end of a list row, so a food can be pinned without opening it. */
export function FavouriteStar({ foodRef, name }: { foodRef: FoodRef; name: string }) {
  const d = useData();
  const key = refKey(foodRef);
  const on = (d.settings.favourites ?? []).some((r) => refKey(r) === key);
  return (
    <button className={`icon-btn fav-star${on ? ' on' : ''}`} aria-pressed={on} aria-label={t(on ? 'fav.unpin' : 'fav.pin', { name })} onClick={() => void repo.toggleFavourite(foodRef)}>
      <Icon name="star" filled={on} />
    </button>
  );
}

/** Pinned meals, matched to logged ones by their items and amounts, with pin and unpin that can be undone. */
export function useFavouriteMeals() {
  const d = useData();
  const toast = useToast();
  const list = d.settings.favouriteMeals;
  const meals = useMemo(() => (list ?? []).map((fav) => ({ fav, meal: favouriteAsMeal(fav) })), [list]);
  const bySignature = useMemo(() => new Map(meals.map(({ fav, meal }) => [mealSignature(meal, d.batchesById), fav])), [meals, d.batchesById]);
  const pinnedOf = (meal: readonly LogEntry[]) => bySignature.get(mealSignature(meal, d.batchesById));
  function unpin(fav: FavouriteMeal) {
    const index = (list ?? []).findIndex((m) => m.id === fav.id);
    void repo.removeFavouriteMeal(fav.id);
    toast(t('fav.mealRemoved'), () => void repo.addFavouriteMeal(fav, index));
  }
  /** Pin a meal, or unpin it when the same items in the same amounts are already pinned. */
  function toggle(meal: readonly LogEntry[]) {
    const pinned = pinnedOf(meal);
    if (pinned) return unpin(pinned);
    const fav = favouriteFromMeal(meal, newId());
    void repo.addFavouriteMeal(fav);
    toast(t('fav.mealPinned'), () => void repo.removeFavouriteMeal(fav.id));
  }
  return { meals, pinnedOf, toggle, unpin };
}

/** Pin a whole meal (its items and amounts) to the top of the log screen. */
export function FavouriteMealButton({ meal }: { meal: readonly LogEntry[] }) {
  const { pinnedOf, toggle } = useFavouriteMeals();
  const pinned = !!pinnedOf(meal);
  return (
    <button className={`btn btn-small btn-ghost fav-btn${pinned ? ' on' : ''}`} aria-pressed={pinned} onClick={() => toggle(meal)}>
      <Icon name="star" size={18} filled={pinned} /> {t(pinned ? 'fav.mealOn' : 'fav.saveMeal')}
    </button>
  );
}
