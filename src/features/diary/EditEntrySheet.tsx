import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { refKey } from '../../lib/refs';
import type { Food } from '../../foods/foodDb';
import { productFood, productLabel, productRef } from '../../foods/products';
import { canReplaceFood, completeDraft, replaceFood, type EntryDraft } from '../../logic/editEntry';
import type { Storage } from '../../model/paramTypes';
import { repo } from '../../storage/repo';
import type { LogEntry, Product } from '../../storage/types';
import { Field, NumberInput, Segmented, Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { BarcodeSheet } from '../log/BarcodeSheet';
import { ConfidenceField } from '../log/ConfidenceField';
import { FoodPicker, type PickedFood } from '../log/FoodPicker';
import { PreparationSelect } from '../log/PreparationSelect';
import { MatchPicker, ProductInfo } from '../log/ProductParts';
import { TimeField } from '../log/TimeField';

/** Change a logged entry: amount, time, confidence, and for foods the food itself (search or barcode). */
export function EditEntrySheet({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [draft, setDraft] = useState<EntryDraft>(entry);
  const [mode, setMode] = useState<'edit' | 'pick' | 'scan'>('edit');
  // The entry's product (Open Food Facts or USDA), if it is one; replaced when another product is picked.
  const savedProduct = entry.kind === 'food' && (entry.ref.source === 'OFF' || entry.ref.source === 'USDA') ? d.productsById.get(refKey(entry.ref)) : undefined;
  const [product, setProduct] = useState<Product | undefined>(savedProduct);
  const [match, setMatch] = useState<Food | undefined>(() => (savedProduct?.match ? d.foods.byCode.get(savedProduct.match.code) : undefined));
  const set = (patch: Partial<EntryDraft>) => setDraft((e) => ({ ...e, ...patch }) as EntryDraft);

  const productDraft = useMemo<Product | undefined>(() => {
    if (!product) return undefined;
    const { match: _saved, ...rest } = product;
    return match ? { ...rest, match: { version: d.foods.version, code: match.code } } : rest;
  }, [product, match, d.foods.version]);
  const food = draft.kind !== 'food' ? undefined : productDraft ? productFood(productDraft, d.foods) : draft.ref.source === 'BLS' ? d.foods.byCode.get(draft.ref.code) : undefined;
  const replaced = draft.kind === 'food' && (entry.kind !== 'food' || refKey(draft.ref) !== refKey(entry.ref));
  // A product with no label values and no matched food would count nothing but a name.
  const hasValues = !productDraft || Object.keys(productDraft.per100).length > 0 || !!match;
  const finished = completeDraft(draft);

  /** The BLS food behind the old entry: a good first guess for a product's missing vitamins and minerals. */
  function oldFood(): Food | undefined {
    if (entry.kind !== 'food') return undefined;
    if (entry.ref.source === 'BLS') return d.foods.byCode.get(entry.ref.code);
    return savedProduct?.match ? d.foods.byCode.get(savedProduct.match.code) : undefined;
  }

  function pick(p: PickedFood) {
    if (p.product) {
      setProduct(p.product);
      setMatch(p.product.match ? d.foods.byCode.get(p.product.match.code) : oldFood());
      setDraft(replaceFood(draft, productRef(p.product), productLabel(p.product), d.customFoodsById));
    } else {
      setProduct(undefined);
      setMatch(undefined);
      setDraft(replaceFood(draft, { source: 'BLS', version: d.foods.version, code: p.food.code }, p.food.nameEn, d.customFoodsById));
    }
    setMode('edit');
  }

  function keepOld() {
    setDraft(entry);
    setProduct(savedProduct);
    setMatch(savedProduct?.match ? d.foods.byCode.get(savedProduct.match.code) : undefined);
  }

  async function save() {
    if (!finished || !hasValues) return;
    if (productDraft) {
      if (product !== savedProduct) await repo.saveProduct(productDraft);
      if (product !== savedProduct || productDraft.match?.code !== product?.match?.code) await repo.setProductMatch(productDraft.id, productDraft.match ?? null);
    }
    await repo.updateLog({ ...finished, day: dayKey(new Date(finished.time)) });
    toast(replaced ? t('edit.replaced', { name: finished.label }) : t('diary.saved'), () => void repo.updateLog(entry));
    onClose();
  }
  async function remove() {
    const old = await repo.deleteLog(entry.id);
    onClose();
    if (old) toast(t('diary.deleted', { name: old.label }), () => void repo.restoreLog(old));
  }

  if (mode === 'scan') return <BarcodeSheet onFound={(product) => pick({ product })} onClose={() => setMode('pick')} />;

  return (
    <Sheet title={draft.label} onClose={onClose}>
      {mode === 'pick' ? (
        <FoodPicker onPick={pick} onScan={() => setMode('scan')} onCancel={() => setMode('edit')} />
      ) : (
        <>
          {replaced && (
            <p className="notice small replaced-note">
              <Icon name="repeat" size={16} /> {t('edit.replaces', { name: entry.label })}{' '}
              <button className="btn btn-small btn-ghost" onClick={keepOld}>
                {t('edit.keepOld')}
              </button>
            </p>
          )}
          {draft.kind === 'food' && productDraft && <ProductInfo product={productDraft} />}
          {draft.kind === 'food' && !productDraft && food && (
            <p className="muted small">
              {food.nameDe} · <a href={`#/food/${food.code}`}>{t('log.details')}</a>
            </p>
          )}
          {canReplaceFood(draft) && (
            <button className="btn btn-secondary btn-block" onClick={() => setMode('pick')}>
              <Icon name="search" /> {t(draft.kind === 'food' ? 'edit.changeFood' : 'edit.replaceWithFood')}
            </button>
          )}
          {draft.kind === 'food' && (
            <>
              <Field label={t('log.amount')}>
                {(id) => <NumberInput id={id} value={draft.grams} onChange={(v) => set({ grams: v })} placeholder="0" suffix={productDraft?.perMl ? 'ml' : 'g'} min={0} autoFocus={!draft.grams} />}
              </Field>
              {productDraft && <MatchPicker key={productDraft.id} product={productDraft} match={match} onChange={setMatch} />}
              <PreparationSelect value={draft.preparation} onChange={(p) => set({ preparation: p })} />
            </>
          )}
          {draft.kind === 'portion' && (
            <>
              <Field label={t('diary.portions')}>{(id) => <NumberInput id={id} value={draft.portions} onChange={(v) => v && set({ portions: v })} min={0} />}</Field>
              <div className="field">
                <span className="field-label">{t('diary.storage')}</span>
                <Segmented<Storage>
                  label={t('diary.storage')}
                  value={draft.storage}
                  onChange={(s) => set({ storage: s })}
                  options={[
                    { value: 'fresh', label: t('storage.fresh') },
                    { value: 'fridge', label: t('storage.fridge') },
                    { value: 'freezer', label: t('storage.freezer') },
                  ]}
                />
              </div>
            </>
          )}
          {draft.kind === 'custom' && (
            <Field label={t('diary.servings')}>{(id) => <NumberInput id={id} value={draft.servings} onChange={(v) => v && set({ servings: v })} min={0} />}</Field>
          )}
          {draft.kind === 'manual' && <p className="muted small">{t('diary.manualHint')}</p>}
          {draft.kind !== 'drink' && <ConfidenceField value={draft.confidence} onChange={(c) => set({ confidence: c })} />}
          <TimeField value={draft.time} onChange={(time) => set({ time })} />
          <div className="sheet-actions">
            <button className="btn btn-danger-ghost" onClick={() => void remove()}>
              {t('common.delete')}
            </button>
            <button className="btn btn-primary" disabled={!finished || !hasValues} onClick={() => void save()}>
              {t('common.save')}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
