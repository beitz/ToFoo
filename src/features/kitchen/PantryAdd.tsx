import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { search } from '../../foods/search';
import { productLabel, productRef } from '../../foods/products';
import type { Food } from '../../foods/foodDb';
import { pantrySuggestions, parseStock, planStock, type NewPantryItem } from '../../logic/pantry';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type HomePlace, type Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { BarcodeSheet } from '../log/BarcodeSheet';
import { usePantry, usePantryFoods, usePantryLeft } from '../pantry/usePantry';

/** Foods and products from the database offered while typing, after things already at home. */
const FOOD_SUGGESTIONS = 3;

/**
 * Type (or scan) what was bought, with suggestions from what is at home, products and the food
 * database. Without a place it goes where that kind of thing usually goes; the "+" on a Kitchen
 * card passes its place (owner's ask, 2026-10-23). Something already at home stays where it is
 * and gets the amount added.
 */
export function PantryAdd({ place, autoFocus, placeholder }: { place?: HomePlace; autoFocus?: boolean; placeholder?: string }) {
  const d = useData();
  const toast = useToast();
  const all = usePantry();
  const left = usePantryLeft();
  const { placeOf } = usePantryFoods();
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const offOn = isOn(d.settings.features, 'openFoodFacts');

  const entry = parseStock(text);
  const q = entry.name.trim();
  const known = useMemo(() => pantrySuggestions(all ?? [], q), [all, q]);
  const products = useMemo(() => {
    if (!q) return [];
    const lower = q.toLowerCase();
    return d.products
      .filter((p) => `${p.name} ${p.brand ?? ''}`.toLowerCase().includes(lower) && !known.some((k) => k.ref && k.ref.source === p.source && 'code' in k.ref && k.ref.code === p.code))
      .slice(0, FOOD_SUGGESTIONS);
  }, [q, d.products, known]);
  const foods = useMemo(() => {
    if (!q) return [];
    return search(d.searchIndex, q, { limit: 12, recent: d.recentFoods, boost: d.searchBoost })
      .map((r) => d.foods.byCode.get(r.key))
      .filter((f): f is Food => !!f && !known.some((k) => k.ref?.source === 'BLS' && k.ref.code === f.code))
      .slice(0, FOOD_SUGGESTIONS);
  }, [q, known, d.searchIndex, d.recentFoods, d.searchBoost, d.foods]);

  async function add(item: Omit<NewPantryItem, 'place'> & { place?: HomePlace }) {
    const withAmount: NewPantryItem = { ...item, place: item.place ?? place ?? placeOf(item.name, item.ref) };
    if (entry.pieces !== undefined) withAmount.pieces = entry.pieces;
    else if (entry.grams !== undefined) withAmount.grams = entry.grams;
    else if (entry.amount) withAmount.amount = entry.amount;
    const undo = await repo.changeHome((pantry) => ({ pantry: planStock(pantry, [withAmount], Date.now(), newId, CURRENT_SCHEMA_VERSION, left) }));
    setText('');
    toast(t('pantry.added', { name: withAmount.name }), () => repo.undoHome(undo));
  }

  async function addProduct(product: Product) {
    setScanning(false);
    const saved = await repo.saveProduct(product);
    const name = productLabel(saved);
    const ref = productRef(saved);
    const item: NewPantryItem = { name, ref, place: place ?? placeOf(name, ref), pieces: 1 };
    const undo = await repo.changeHome((pantry) => ({ pantry: planStock(pantry, [item], Date.now(), newId, CURRENT_SCHEMA_VERSION, left) }));
    toast(t('pantry.added', { name }), () => repo.undoHome(undo));
  }

  const showSuggestions = q !== '' && known.length + products.length + foods.length > 0;
  const hint = placeholder ?? t('pantry.addPlaceholder');

  return (
    <>
      <form
        className="shop-add"
        data-tour={place ? undefined : 'kitchen.add'}
        onSubmit={(e) => {
          e.preventDefault();
          if (q) void add({ name: q });
        }}
      >
        <div className="search-box grow">
          <Icon name="plus" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={hint} aria-label={hint} enterKeyHint="done" autoComplete="off" autoFocus={autoFocus} />
        </div>
        {offOn && (
          <button type="button" className="icon-btn scan-btn" onClick={() => setScanning(true)} aria-label={t('pantry.scan')} title={t('pantry.scan')}>
            <Icon name="barcode" />
          </button>
        )}
        <button className="btn btn-primary" type="submit" disabled={!q}>
          {t('pantry.add')}
        </button>
      </form>
      {showSuggestions && (
        <ul className="result-list shop-suggestions" aria-label={t('pantry.suggestions')}>
          {known.map((k) => (
            <li key={k.id}>
              <button className="result" onClick={() => void add({ name: k.name, place: k.place, ...(k.ref ? { ref: k.ref } : {}) })}>
                <span className="result-name">{k.name}</span>
                <span className="muted small">{t('pantry.alreadyHere')}</span>
              </button>
            </li>
          ))}
          {products.map((p) => (
            <li key={p.id}>
              <button className="result" onClick={() => void add({ name: productLabel(p), ref: productRef(p) })}>
                <span className="result-name">{productLabel(p)}</span>
                <span className="muted small">{p.quantity ?? p.source}</span>
              </button>
            </li>
          ))}
          {foods.map((f) => (
            <li key={f.code}>
              <button className="result" onClick={() => void add({ name: f.nameEn, ref: { source: 'BLS', version: d.foods.version, code: f.code } })}>
                <span className="result-name">{f.nameEn}</span>
                <span className="muted small">{f.nameDe}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {scanning && <BarcodeSheet onFound={(p) => void addProduct(p)} onClose={() => setScanning(false)} />}
    </>
  );
}
