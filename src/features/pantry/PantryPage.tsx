import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { search } from '../../foods/search';
import { productLabel, productRef } from '../../foods/products';
import type { Food } from '../../foods/foodDb';
import { byPlace, onShoppingList, pantrySuggestions, parseStock, planStock, type Left, type NewPantryItem } from '../../logic/pantry';
import { onList } from '../../logic/shopping';
import { totalLeft, nextStorage } from '../../logic/stock';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type HomePlace, type PantryItem, type Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { BarcodeSheet } from '../log/BarcodeSheet';
import { useShopping } from '../shopping/useShopping';
import { PutAwaySheet } from './PutAwaySheet';
import { PantryItemSheet } from './PantryItemSheet';
import { leftLabel, placeName, usePantry, usePantryFoods, usePantryLeft } from './usePantry';
import { BackButton } from '../../ui/BackButton';

/** Foods and products from the database offered while typing, after things already at home. */
const FOOD_SUGGESTIONS = 3;

/**
 * Route #/athome: what is at home, by fridge, freezer, cupboard and spices, with cooked batches
 * on top. Type (or scan) what was bought; tap a thing to change how much is left, mark it running
 * low or used up. Amounts go down by themselves as meals and pots are logged.
 */
export function PantryPage() {
  const d = useData();
  const toast = useToast();
  const all = usePantry();
  const shopping = useShopping();
  const left = usePantryLeft();
  const { placeOf } = usePantryFoods();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [puttingAway, setPuttingAway] = useState(false);
  const offOn = isOn(d.settings.features, 'openFoodFacts');
  const shoppingOn = isOn(d.settings.features, 'shoppingList');

  const items = all ?? [];
  const here = items.filter((i) => !left(i).out);
  const usedUp = items.filter((i) => left(i).out).sort((a, b) => a.name.localeCompare(b.name));
  const cooked = d.batches.filter((b) => totalLeft(b) > 0).sort((a, b) => a.cookedAt - b.cookedAt);
  const basket = (shopping ?? []).filter((s) => onList(s) && s.checkedAt !== undefined);

  const entry = parseStock(text);
  const q = entry.name.trim();
  const known = useMemo(() => pantrySuggestions(all ?? [], q), [all, q]);
  const products = useMemo(() => {
    if (!q) return [];
    const lower = q.toLowerCase();
    return d.products.filter((p) => `${p.name} ${p.brand ?? ''}`.toLowerCase().includes(lower) && !known.some((k) => k.ref && k.ref.source === p.source && 'code' in k.ref && k.ref.code === p.code)).slice(0, FOOD_SUGGESTIONS);
  }, [q, d.products, known]);
  const foods = useMemo(() => {
    if (!q) return [];
    return search(d.searchIndex, q, { limit: 12, recent: d.recentFoods, boost: d.searchBoost })
      .map((r) => d.foods.byCode.get(r.key))
      .filter((f): f is Food => !!f && !known.some((k) => k.ref?.source === 'BLS' && k.ref.code === f.code))
      .slice(0, FOOD_SUGGESTIONS);
  }, [q, known, d.searchIndex, d.recentFoods, d.searchBoost, d.foods]);

  async function add(item: Omit<NewPantryItem, 'place'> & { place?: HomePlace }) {
    const withAmount: NewPantryItem = { ...item, place: item.place ?? placeOf(item.name, item.ref) };
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
    const item: NewPantryItem = { name, ref, place: placeOf(name, ref), pieces: 1 };
    const undo = await repo.changeHome((pantry) => ({ pantry: planStock(pantry, [item], Date.now(), newId, CURRENT_SCHEMA_VERSION, left) }));
    toast(t('pantry.added', { name }), () => repo.undoHome(undo));
  }

  const showSuggestions = q !== '' && known.length + products.length + foods.length > 0;

  return (
    <section className="pantry-page">
      <header className="page-head row-between">
        <BackButton />
        <h1 className="grow">{t('pantry.title')}</h1>
        {shoppingOn && (
          <a className="icon-btn" href={href('shopping')} aria-label={t('shopping.title')} title={t('shopping.title')}>
            <Icon name="cart" />
          </a>
        )}
      </header>

      <form
        className="shop-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (q) void add({ name: q });
        }}
      >
        <div className="search-box grow">
          <Icon name="plus" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('pantry.addPlaceholder')} aria-label={t('pantry.addPlaceholder')} enterKeyHint="done" autoComplete="off" />
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

      {shoppingOn && basket.length > 0 && (
        <button className="btn btn-secondary btn-block" onClick={() => setPuttingAway(true)}>
          <Icon name="cart" size={18} /> {t('pantry.putAwayBasket', { n: basket.length })}
        </button>
      )}

      {all && items.length === 0 && cooked.length === 0 && <p className="muted empty">{t('pantry.empty')}</p>}

      {cooked.length > 0 && (
        <div>
          <h2 className="section-title shop-section">{t('pantry.cooked')}</h2>
          <ul className="plain-list shop-list">
            {cooked.map((b) => {
              const s = nextStorage(b, d.today);
              return (
                <li key={b.id}>
                  <a className="home-row" href={href('recipes', b.recipeId)}>
                    <Icon name={s === 'freezer' ? 'snow' : s === 'fridge' ? 'fridge' : 'pot'} size={18} />
                    <span className="shop-text">
                      <span className="shop-name">{b.recipe.name}</span>
                    </span>
                    <span className="shop-amount">{t('stock.left', { n: totalLeft(b) })}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {byPlace(here).map((g) => (
        <div key={g.place}>
          <h2 className="section-title shop-section">{placeName(g.place)}</h2>
          <ul className="plain-list shop-list">
            {g.items.map((i) => (
              <li key={i.id}>
                <Row item={i} left={left(i)} onList={onShoppingList(i, shopping ?? [])} onEdit={() => setEditing(i)} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {usedUp.length > 0 && (
        <div>
          <h2 className="section-title shop-section">{t('pantry.usedUpN', { n: usedUp.length })}</h2>
          <ul className="plain-list shop-list">
            {usedUp.map((i) => (
              <li key={i.id}>
                <Row item={i} left={left(i)} onList={onShoppingList(i, shopping ?? [])} onEdit={() => setEditing(i)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {items.length > 0 && <p className="muted small pantry-hint">{t('pantry.hint')}</p>}

      {editing && <PantryItemSheet key={editing.id} item={editing} onClose={() => setEditing(null)} />}
      {scanning && <BarcodeSheet onFound={(p) => void addProduct(p)} onClose={() => setScanning(false)} />}
      {puttingAway && <PutAwaySheet onClose={() => setPuttingAway(false)} />}
    </section>
  );
}

/** One thing at home: its name, running low or used up in words, and how much is left. */
function Row({ item, left, onList, onEdit }: { item: PantryItem; left: Left; onList: boolean; onEdit: () => void }) {
  const amount = leftLabel(item, left);
  const status = left.out ? t('pantry.out') : left.low ? t('pantry.low') : '';
  return (
    <button className={`home-row${left.out ? ' out' : ''}`} onClick={onEdit}>
      <span className="shop-text">
        <span className="shop-name">{item.name}</span>
        {status && (
          <span className="small home-status">
            {left.low && <Icon name="alert" size={14} />}
            {status}
            {onList && ` · ${t('pantry.onList')}`}
          </span>
        )}
      </span>
      {amount && !left.out && <span className="shop-amount">{amount}</span>}
      <Icon name="chevron" size={16} />
    </button>
  );
}
