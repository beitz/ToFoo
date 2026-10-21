import { useMemo, useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { fromShopping, planStock } from '../../logic/pantry';
import { amountText, onList, planClear, sameThing } from '../../logic/shopping';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, HOME_PLACES, type HomePlace } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/controls';
import { useShopping } from '../shopping/useShopping';
import { placeName, usePantry, usePantryFoods, usePantryLeft } from './usePantry';

/**
 * After shopping: what is in the basket goes to At home in one go (things already there get the
 * amount bought added), and the basket leaves the shopping list. Food is ticked; things that are
 * not (toilet paper) start unticked.
 */
export function PutAwaySheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const shopping = useShopping();
  const pantry = usePantry();
  const left = usePantryLeft();
  const { placeOf } = usePantryFoods();
  const lines = useMemo(() => {
    const basket = (shopping ?? []).filter((s) => onList(s) && s.checkedAt !== undefined).sort((a, b) => a.addedAt - b.addedAt);
    return basket.map((line) => {
      const home = (pantry ?? []).find((p) => sameThing(p, line));
      return { line, home, place: home?.place ?? placeOf(line.name, line.ref), selected: !!home || !!line.ref || line.section !== 'other' };
    });
    // Places are guessed once, when the lists have loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopping === undefined, pantry === undefined]);
  const [ticked, setTicked] = useState<ReadonlySet<string> | undefined>();
  const [places, setPlaces] = useState<Readonly<Record<string, HomePlace>>>({});
  const on = ticked ?? new Set(lines.filter((l) => l.selected).map((l) => l.line.id));
  const chosen = lines.filter((l) => on.has(l.line.id));

  async function putAway(store: boolean) {
    const now = Date.now();
    const adds = store ? chosen.map((l) => fromShopping(l.line, places[l.line.id] ?? l.place)) : [];
    const undo = await repo.changeHome((items, list) => ({
      pantry: planStock(items, adds, now, newId, CURRENT_SCHEMA_VERSION, left),
      shopping: planClear(list, now),
    }));
    toast(store ? t('pantry.putAwayDone', { n: adds.length }) : t('shopping.cleared', { n: lines.length }), () => repo.undoHome(undo));
    onClose();
  }

  const toggle = (id: string) => {
    const next = new Set(on);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  };

  return (
    <Sheet title={t('pantry.putAwayTitle')} onClose={onClose}>
      <p className="muted small">{t('pantry.putAwayHint')}</p>
      <ul className="plain-list shop-pick">
        {lines.map(({ line, home, place }) => (
          <li key={line.id} className="put-away-row">
            <button className="shop-row" role="checkbox" aria-checked={on.has(line.id)} onClick={() => toggle(line.id)}>
              <span className={`shop-check${on.has(line.id) ? ' on' : ''}`} aria-hidden>
                {on.has(line.id) && <Icon name="check" size={16} />}
              </span>
              <span className="shop-text">
                <span className="shop-name">{line.name}</span>
                {home && <span className="muted small">{t('pantry.addsUp')}</span>}
              </span>
              <span className="muted small shop-amount">{amountText(line)}</span>
            </button>
            {on.has(line.id) && (
              <select className="put-away-place" value={places[line.id] ?? place} onChange={(e) => setPlaces({ ...places, [line.id]: e.target.value as HomePlace })} aria-label={t('pantry.place')}>
                {HOME_PLACES.map((p) => (
                  <option key={p} value={p}>
                    {placeName(p)}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={() => void putAway(false)}>
          {t('pantry.justClear')}
        </button>
        <button className="btn btn-primary" disabled={!chosen.length} onClick={() => void putAway(true)}>
          {t('pantry.putAwayN', { n: chosen.length })}
        </button>
      </div>
    </Sheet>
  );
}
