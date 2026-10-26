import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { search } from '../../foods/search';
import { productLabel, productRef } from '../../foods/products';
import type { Food } from '../../foods/foodDb';
import { packGrams, pantrySuggestions, parseStock, planStock, scannedAmount, type NewPantryItem } from '../../logic/pantry';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type HomePlace, type Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { BarcodeSheet, LOOKUP_ERRORS } from '../log/BarcodeSheet';
import { useOffSearch } from '../log/OffResults';
import { findProduct } from '../../foods/findProduct';
import type { OffListing } from '../../foods/offIndex';
import { usePantry, usePantryFoods, usePantryLeft } from '../pantry/usePantry';

/** Foods and products from the database offered while typing, after things already at home. */
const FOOD_SUGGESTIONS = 3;

type Looking = { code: string; error?: undefined } | { code: string; error: string; detail?: string } | null;

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
  const [looking, setLooking] = useState<Looking>(null);
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
  // Packaged products sold in Germany: most spices (bay leaves, cinnamon, nutmeg) are not in the
  // BLS but are on Open Food Facts (owner's search for "Lorbeerblatt", 2026-10-26).
  const offSearch = useOffSearch(q, offOn, foods);
  const offHits = offSearch.hits.slice(0, FOOD_SUGGESTIONS);

  /** The amount typed with the name ("2", "500 g", "1 l"), if any. */
  const typedAmount = (): Pick<NewPantryItem, 'pieces' | 'grams' | 'amount'> | undefined => {
    if (entry.pieces !== undefined) return { pieces: entry.pieces };
    if (entry.grams !== undefined) return { grams: entry.grams };
    if (entry.amount) return { amount: entry.amount };
    return undefined;
  };

  async function add(item: Omit<NewPantryItem, 'place'> & { place?: HomePlace }) {
    const withAmount: NewPantryItem = { ...item, place: item.place ?? place ?? placeOf(item.name, item.ref), ...typedAmount() };
    const undo = await repo.changeHome((pantry) => ({ pantry: planStock(pantry, [withAmount], Date.now(), newId, CURRENT_SCHEMA_VERSION, left) }));
    setText('');
    toast(t('pantry.added', { name: withAmount.name }), () => repo.undoHome(undo));
  }

  /** A scanned or picked product; an amount typed with the name wins over the pack's. */
  async function addProduct(product: Product, amount = typedAmount()) {
    setScanning(false);
    const saved = await repo.saveProduct(product);
    const name = productLabel(saved);
    const ref = productRef(saved);
    // By the product's own name: it may not be in the live list of products yet.
    const where = place ?? placeOf(saved.name, ref);
    const item: NewPantryItem = { name, ref, place: where, ...(amount ?? scannedAmount(where, packGrams(saved))) };
    const undo = await repo.changeHome((pantry) => ({ pantry: planStock(pantry, [item], Date.now(), newId, CURRENT_SCHEMA_VERSION, left) }));
    setText('');
    toast(t('pantry.added', { name }), () => repo.undoHome(undo));
  }

  /** A product from the bundled Open Food Facts list: its label values are fetched by barcode, as a scan would. */
  async function pickListed(row: OffListing) {
    if (looking && !looking.error) return;
    setLooking({ code: row.code });
    const r = await findProduct(row.code);
    if (r.kind === 'found') {
      setLooking(null);
      await addProduct(r.product);
    } else if (r.kind === 'notFound') setLooking({ code: row.code, error: t('offList.notFound') });
    else setLooking({ code: row.code, error: t(LOOKUP_ERRORS[r.reason]), ...(r.detail ? { detail: r.detail } : {}) });
  }

  const showSuggestions = q !== '' && known.length + products.length + foods.length + offHits.length > 0;
  // Nothing matched anywhere: say that the typed name works on its own (owner's search for "Lorbeerblatt").
  const notListed = q.length >= 3 && !showSuggestions && offSearch.status !== 'loading';
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
          {offHits.map((row) => {
            const here = looking?.code === row.code ? looking : null;
            return (
              <li key={`off:${row.code}`}>
                <button className="result" onClick={() => void pickListed(row)} aria-busy={!!here && !here.error}>
                  <span className="result-name">{row.name}</span>
                  <span className="muted small">{here && !here.error ? t('offList.looking') : [row.brand, row.quantity, 'Open Food Facts'].filter(Boolean).join(' · ')}</span>
                </button>
                {here?.error && (
                  <p className="notice small" role="alert">
                    <Icon name="alert" size={16} /> {here.error}
                    {here.detail && <span className="muted small block error-detail">{t('off.error.detail', { detail: here.detail })}</span>}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {offSearch.status === 'error' && (
        <p className="notice small" role="alert">
          <Icon name="alert" size={16} /> {t('offList.loadFailed')}
          <span className="muted small block error-detail">{t('off.error.detail', { detail: offSearch.detail })}</span>
        </p>
      )}
      {notListed && <p className="muted small pantry-not-listed">{t('pantry.notListed', { name: q })}</p>}
      {scanning && <BarcodeSheet onFound={(p) => void addProduct(p)} onClose={() => setScanning(false)} />}
    </>
  );
}
