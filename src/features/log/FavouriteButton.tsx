import { useData } from '../../app/data';
import { t } from '../../i18n';
import { refKey } from '../../lib/refs';
import { repo } from '../../storage/repo';
import type { FoodRef } from '../../storage/types';
import { Icon } from '../../ui/Icon';

/** Pin a food to the top of the log screen. The label says the state, so it never rests on the star's fill alone. */
export function FavouriteButton({ foodRef }: { foodRef: FoodRef }) {
  const d = useData();
  const key = refKey(foodRef);
  const on = (d.settings.favourites ?? []).some((r) => refKey(r) === key);
  return (
    <button className={`btn btn-small btn-ghost fav-btn${on ? ' on' : ''}`} aria-pressed={on} onClick={() => void repo.toggleFavourite(foodRef)}>
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
