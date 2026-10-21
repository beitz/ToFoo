import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { productFood, productLabel, productRef } from '../../foods/products';
import { fmtNumber } from '../../lib/format';
import { parseAmount } from '../../logic/shopping';
import { dayKey } from '../../lib/dates';
import type { Preparation } from '../../model/paramTypes';
import type { EntryConfidence } from '../../model/types';
import { repo } from '../../storage/repo';
import type { FoodRef, LogEntry, PortionSize, Product } from '../../storage/types';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { ConfidenceField } from './ConfidenceField';
import { TimeField } from './TimeField';
import { PreparationSelect } from './PreparationSelect';
import { MatchPicker, ProductInfo } from './ProductParts';
import { FavouriteButton } from './FavouriteButton';

/** Saved portion sizes are in backups (src/storage/autoBackup.ts `readSnapshot`). */
export type PortionHelper = PortionSize;

type Target = { food: Food; product?: undefined } | { product: Product; food?: undefined };

/** Pick an amount of a BLS food or a product (Open Food Facts or USDA) and log it. */
export function AmountSheet({ day, time: initialTime, onClose, onAdded, ...target }: Target & { day: string; time: number; onClose: () => void; onAdded: (e: LogEntry) => void }) {
  const d = useData();
  const product = target.product;
  const [match, setMatch] = useState<Food | undefined>(() => (product?.match ? d.foods.byCode.get(product.match.code) : undefined));
  const draft = useMemo<Product | undefined>(() => {
    if (!product) return undefined;
    const { match: _saved, ...rest } = product;
    return match ? { ...rest, match: { version: d.foods.version, code: match.code } } : rest;
  }, [product, match, d.foods.version]);
  const food = draft ? productFood(draft, d.foods) : target.food!;
  const name = draft ? productLabel(draft) : food.nameEn;

  const helpers = useLiveQuery(() => repo.getMeta<PortionHelper[]>(`portions:${food.code}`), [food.code]) ?? [];
  const last = useLiveQuery(() => repo.getMeta<number>(`lastGrams:${food.code}`), [food.code]);
  const [grams, setGrams] = useState<number>();
  const [prep, setPrep] = useState<Preparation>('asListed');
  const [confidence, setConfidence] = useState<EntryConfidence>('A');
  const [time, setTime] = useState(initialTime);
  const [helperName, setHelperName] = useState('');
  const kcal = typeof food.per100.ENERCC === 'number' && grams ? (food.per100.ENERCC * grams) / 100 : undefined;
  const serving = draft?.serving ? [{ label: draft.serving.label, grams: draft.serving.grams }] : [];
  // The pack size as printed ("400 g"), for a ready meal or a bar eaten whole.
  const packGrams = draft?.quantity && !draft.perMl ? parseAmount(draft.quantity).grams : undefined;
  const pack = packGrams && packGrams !== draft?.serving?.grams ? [{ label: t('log.wholePack'), grams: packGrams }] : [];
  const chips: PortionHelper[] = [...helpers, ...serving, ...pack, ...(last ? [{ label: t('log.lastTime'), grams: last }] : []), { label: '50 g', grams: 50 }, { label: '100 g', grams: 100 }, { label: '200 g', grams: 200 }];
  // A product with no label values and no matched food would log nothing but a name.
  const hasValues = !draft || Object.keys(draft.per100).length > 0 || !!match;

  async function save() {
    if (!grams || !hasValues) return;
    let ref: FoodRef = { source: 'BLS', version: d.foods.version, code: food.code };
    if (draft) {
      await repo.saveProduct(draft);
      await repo.setProductMatch(draft.id, draft.match ?? null);
      ref = productRef(draft);
    }
    const entry = await repo.addLog({ kind: 'food', ref, grams, preparation: prep, time, day: time ? dayKey(new Date(time)) : day, confidence, label: name });
    await repo.setMeta(`lastGrams:${food.code}`, grams);
    onAdded(entry);
  }

  async function saveHelper() {
    if (!grams || !helperName.trim()) return;
    await repo.setMeta(`portions:${food.code}`, [...helpers.filter((h) => h.label !== helperName.trim()), { label: helperName.trim(), grams }]);
    setHelperName('');
  }

  return (
    <Sheet title={name} onClose={onClose}>
      <FavouriteButton foodRef={draft ? productRef(draft) : { source: 'BLS', version: d.foods.version, code: food.code }} />
      {draft ? (
        <>
          <ProductInfo product={draft} />
          {d.productsById.has(draft.id) && (
            <p className="muted small">
              <a href={`#/food/${encodeURIComponent(draft.id)}`}>{t('log.details')}</a>
            </p>
          )}
        </>
      ) : (
        <p className="muted small">
          {food.nameDe} · <a href={`#/food/${food.code}`}>{t('log.details')}</a>
        </p>
      )}
      <Field label={t('log.amount')}>
        {(id) => <NumberInput id={id} value={grams} onChange={setGrams} placeholder="0" suffix={draft?.perMl ? 'ml' : 'g'} min={0} autoFocus />}
      </Field>
      <div className="chips">
        {chips.map((c) => (
          <button key={`${c.label}-${c.grams}`} className={`chip${grams === c.grams ? ' on' : ''}`} onClick={() => setGrams(c.grams)}>
            {c.label === `${c.grams} g` || c.label.includes(`${c.grams} g`) ? c.label : `${c.label} (${fmtNumber(c.grams, 1)} g)`}
          </button>
        ))}
      </div>
      {grams ? (
        <div className="row helper-row">
          <input className="small-input" placeholder={t('log.portionName')} value={helperName} onChange={(e) => setHelperName(e.target.value)} aria-label={t('log.portionName')} />
          <button className="btn btn-small btn-ghost" disabled={!helperName.trim()} onClick={() => void saveHelper()}>
            {t('log.savePortion')}
          </button>
        </div>
      ) : null}
      {draft && <MatchPicker product={draft} match={match} onChange={setMatch} />}
      <PreparationSelect value={prep} onChange={setPrep} />
      <ConfidenceField value={confidence} onChange={setConfidence} />
      <TimeField value={time} onChange={setTime} />
      <div className="sheet-actions">
        {kcal !== undefined && <span className="muted">{fmtNumber(kcal)} kcal</span>}
        <button className="btn btn-primary" disabled={!grams || !hasValues} onClick={() => void save()}>
          {t('log.add')}
        </button>
      </div>
    </Sheet>
  );
}
