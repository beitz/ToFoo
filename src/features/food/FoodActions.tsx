import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { refKey } from '../../lib/refs';
import { planStock, stockAmount, type NewPantryItem } from '../../logic/pantry';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, HOME_PLACES, type FoodRef, type HomePlace, type PantryItem } from '../../storage/types';
import { Field } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { FavouriteButton } from '../log/FavouriteButton';
import { PantryItemSheet } from '../pantry/PantryItemSheet';
import { leftLabel, placeName, usePantry, usePantryFoods, usePantryLeft } from '../pantry/usePantry';

/**
 * Keep a food for later from wherever it is shown (owner's ask, 2026-10-25): pin it as a favourite,
 * or put it in the kitchen, like a bread logged days ago that is still in the freezer. `prepare` runs
 * before either: a product just scanned is saved first, or both would point at nothing. `inSheet`:
 * shown inside a sheet, so the kitchen part stays inline instead of opening a second sheet.
 */
export function FoodActions({ foodRef, name, prepare, inSheet }: { foodRef: FoodRef; name: string; prepare?: () => Promise<void>; inSheet?: boolean }) {
  const d = useData();
  const pantry = usePantry();
  const leftOf = usePantryLeft();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const homeOn = isOn(d.settings.features, 'atHome');
  const key = refKey(foodRef);
  // The thing at home that is this food, unless it is used up (then adding it is buying it again).
  const item = homeOn ? pantry?.find((i) => i.ref && refKey(i.ref) === key && !leftOf(i).out) : undefined;
  const left = item ? leftLabel(item, leftOf(item)) : '';
  return (
    <>
      <div className="row wrap food-actions">
        <FavouriteButton foodRef={foodRef} prepare={prepare} />
        {homeOn && (
          <button className={`btn btn-small btn-ghost fav-btn${item ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Icon name="kitchen" size={18} /> {item ? (left ? t('kitchenAdd.atHomeLeft', { left }) : t('kitchenAdd.atHome')) : t('kitchenAdd.button')}
          </button>
        )}
      </div>
      {open && (
        <KitchenPanel
          foodRef={foodRef}
          name={name}
          item={item}
          left={left}
          prepare={prepare}
          onEdit={inSheet || !item ? undefined : () => setEditing(item)}
          onClose={() => setOpen(false)}
        />
      )}
      {editing && <PantryItemSheet item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/**
 * Where it goes (guessed like the Kitchen's own add box) and how much, all optional. Already at home:
 * says how much is left and where, and an amount typed is added to it.
 */
function KitchenPanel({
  foodRef,
  name,
  item,
  left,
  prepare,
  onEdit,
  onClose,
}: {
  foodRef: FoodRef;
  name: string;
  item?: PantryItem;
  left: string;
  prepare?: () => Promise<void>;
  onEdit?: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const pantry = usePantry();
  const leftOf = usePantryLeft();
  const { placeOf } = usePantryFoods();
  const [place, setPlace] = useState<HomePlace>(() => item?.place ?? placeOf(name, foodRef));
  const [amount, setAmount] = useState('');
  const typed = amount.trim();

  async function add() {
    await prepare?.();
    const add: NewPantryItem = { name, ref: foodRef, place, ...stockAmount(typed) };
    const undo = await repo.changeHome((all) => ({ pantry: planStock(all, [add], Date.now(), newId, CURRENT_SCHEMA_VERSION, leftOf) }));
    toast(t('pantry.added', { name: item?.name ?? name }), () => repo.undoHome(undo));
    onClose();
  }

  return (
    <div className="card kitchen-add">
      {item ? (
        <div className="row-between">
          <span>{left ? t('kitchenAdd.hereLeft', { left, place: placeName(item.place) }) : t('kitchenAdd.here', { place: placeName(item.place) })}</span>
          {onEdit && (
            <button className="btn btn-small btn-ghost" onClick={onEdit}>
              <Icon name="edit" size={16} /> {t('kitchenAdd.change')}
            </button>
          )}
        </div>
      ) : (
        <div className="field">
          <span className="field-label">{t('pantry.place')}</span>
          <div className="chips" role="radiogroup" aria-label={t('pantry.place')}>
            {HOME_PLACES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={p === place} className={`chip${p === place ? ' on' : ''}`} onClick={() => setPlace(p)}>
                {placeName(p)}
              </button>
            ))}
          </div>
        </div>
      )}
      <Field label={t(item ? 'kitchenAdd.more' : 'kitchenAdd.amount')} hint={t('kitchenAdd.amountHint')}>
        {(id) => <input id={id} value={amount} placeholder={t('pantry.amountPlaceholder')} onChange={(e) => setAmount(e.target.value)} enterKeyHint="done" autoComplete="off" />}
      </Field>
      <div className="row kitchen-add-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" disabled={!pantry || (!!item && !typed)} onClick={() => void add()}>
          {t(item ? 'kitchenAdd.addMore' : 'kitchenAdd.add')}
        </button>
      </div>
    </div>
  );
}
