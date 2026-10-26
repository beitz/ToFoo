import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { productLabel, productRef } from '../../foods/products';
import { amountField, fmtLeftGrams, leftOf, piecesAsGrams, stockAmount, withAmount } from '../../logic/pantry';
import { repo } from '../../storage/repo';
import { HOME_PLACES, type FoodRef, type HomePlace, type PantryItem } from '../../storage/types';
import { Field, Segmented, Sheet } from '../../ui/controls';
import { refHref } from '../food/links';
import { BarcodeSheet } from '../log/BarcodeSheet';
import { FoodPicker, type PickedFood } from '../log/FoodPicker';
import { placeName, useMarkPantry, usePantryFoods, usePantryLeft } from './usePantry';

type Status = 'have' | 'low' | 'out';

/**
 * Change something at home: its name, the food it is, how much is left (counted again from now),
 * where it is kept, and whether it is running low or used up (which puts it on the shopping list).
 */
export function PantryItemSheet({ item, onClose }: { item: PantryItem; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const left = usePantryLeft()(item);
  const { nameOfRef, packGramsOf } = usePantryFoods();
  const mark = useMarkPantry();
  const startAmount = amountField(item, left);
  const startStatus: Status = left.out ? 'out' : left.low ? 'low' : 'have';
  const [name, setName] = useState(item.name);
  const [ref, setRef] = useState<FoodRef | undefined>(item.ref);
  const [amount, setAmount] = useState(startAmount);
  const [place, setPlace] = useState<HomePlace>(item.place);
  const [status, setStatus] = useState<Status>(startStatus);
  const [picking, setPicking] = useState<'search' | 'scan' | null>(null);

  async function pick(p: PickedFood) {
    setPicking(null);
    if (p.product) {
      const saved = await repo.saveProduct(p.product);
      setRef(productRef(saved));
      if (name === item.name && !item.ref) setName(productLabel(saved));
    } else {
      setRef({ source: 'BLS', version: d.foods.version, code: p.food.code });
    }
  }

  async function save() {
    if (!name.trim()) return;
    const now = Date.now();
    let next: PantryItem = { ...item, name: name.trim(), place };
    if (ref) next.ref = ref;
    else delete next.ref;
    // A new amount is counted from now; an unchanged one keeps counting from when it was set.
    const amountChanged = amount.trim() !== startAmount;
    if (amountChanged) next = withAmount(next, stockAmount(amount), now);
    if (status === startStatus) {
      const undo = await repo.changeHome(() => ({ pantry: { put: [next], remove: [] } }));
      toast(t('pantry.saved', { name: next.name }), () => repo.undoHome(undo));
    } else {
      const newStatus = status === 'have' ? undefined : status;
      const { undo, listed } = await mark(next, newStatus, amountChanged ? leftOf(next, new Map()) : left);
      const said = t(newStatus === 'low' ? 'pantry.markedLow' : newStatus === 'out' ? 'pantry.markedOut' : 'pantry.saved', { name: next.name });
      toast(listed ? `${said} ${t('pantry.listed', { name: next.name })}` : said, () => repo.undoHome(undo));
    }
    onClose();
  }

  /** A positive amount typed for something used up means it is there again. */
  function changeAmount(text: string) {
    setAmount(text);
    const a = stockAmount(text);
    if (status === 'out' && ((a.pieces ?? 0) > 0 || (a.grams ?? 0) > 0)) setStatus('have');
  }

  async function remove() {
    const undo = await repo.changeHome(() => ({ pantry: { put: [], remove: [item.id] } }));
    toast(t('pantry.removed', { name: item.name }), () => repo.undoHome(undo));
    onClose();
  }

  // Counted in jars or packs whose weight is known: one tap counts it in grams instead, to be
  // corrected to what is really left (owner's ask 2026-10-26: 8.5 g left of a 12.5 g spice jar).
  const typed = stockAmount(amount);
  const asGrams = piecesAsGrams({ out: false, low: false, ...(typed.pieces !== undefined ? { pieces: typed.pieces } : {}) }, packGramsOf(ref));

  if (picking === 'scan') return <BarcodeSheet onFound={(product) => void pick({ product })} onClose={() => setPicking('search')} />;

  return (
    <Sheet title={item.name} onClose={onClose}>
      {picking === 'search' ? (
        <FoodPicker onPick={(p) => void pick(p)} onScan={() => setPicking('scan')} onCancel={() => setPicking(null)} />
      ) : (
        <>
          <div className="field">
            <span className="field-label">{t('pantry.status')}</span>
            <Segmented label={t('pantry.status')} value={status} onChange={setStatus} options={[{ value: 'have', label: t('pantry.have') }, { value: 'low', label: t('pantry.low') }, { value: 'out', label: t('pantry.out') }]} />
          </div>
          <Field label={t('pantry.amount')} hint={t('pantry.amountHint')}>
            {(id) => <input id={id} value={amount} placeholder={t('pantry.amountPlaceholder')} onChange={(e) => changeAmount(e.target.value)}/>}
          </Field>
          {asGrams !== undefined && asGrams > 0 && (
            <div className="chips pantry-in-grams">
              <button className="chip" onClick={() => changeAmount(fmtLeftGrams(asGrams))}>
                {t('pantry.inGrams', { grams: fmtLeftGrams(asGrams) })}
              </button>
            </div>
          )}
          <Field label={t('pantry.place')}>
            {(id) => (
              <select id={id} value={place} onChange={(e) => setPlace(e.target.value as HomePlace)}>
                {HOME_PLACES.map((p) => (
                  <option key={p} value={p}>
                    {placeName(p)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('pantry.food')} hint={t('pantry.foodHint')}>
            {(id) => (
              <div className="row-between pantry-food" id={id}>
                {ref && ref === item.ref && refHref(d, ref) ? (
                  <a href={refHref(d, ref)}>{nameOfRef(ref) ?? item.name}</a>
                ) : (
                  <span className={ref ? '' : 'muted'}>{ref ? (nameOfRef(ref) ?? item.name) : t('pantry.noFood')}</span>
                )}
                <button className="btn btn-small btn-ghost" onClick={() => setPicking('search')}>
                  {ref ? t('pantry.changeFood') : t('pantry.chooseFood')}
                </button>
              </div>
            )}
          </Field>
          <Field label={t('pantry.name')}>{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <div className="sheet-actions">
            <button className="btn btn-danger-ghost" onClick={() => void remove()}>
              {t('pantry.remove')}
            </button>
            <button className="btn btn-primary" disabled={!name.trim()} onClick={() => void save()}>
              {t('common.save')}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
