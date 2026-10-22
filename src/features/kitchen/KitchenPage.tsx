import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { newId } from '../../lib/id';
import { search } from '../../foods/search';
import { productLabel, productRef } from '../../foods/products';
import type { Food } from '../../foods/foodDb';
import { onShoppingList, pantrySuggestions, parseStock, planStock, type Left, type NewPantryItem } from '../../logic/pantry';
import { amountText, isOpen, onList } from '../../logic/shopping';
import { kitchenPlaces, placeCount, sectionInView } from '../../logic/kitchen';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type Batch, type HomePlace, type PantryItem, type Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { formatDay } from '../../lib/dates';
import { BarcodeSheet } from '../log/BarcodeSheet';
import { useShopping } from '../shopping/useShopping';
import { PutAwaySheet } from '../pantry/PutAwaySheet';
import { PantryItemSheet } from '../pantry/PantryItemSheet';
import { leftLabel, placeName, usePantry, usePantryFoods, usePantryLeft } from '../pantry/usePantry';
import { SettingsButton } from '../../ui/SettingsButton';

/** Foods and products from the database offered while typing, after things already at home. */
const FOOD_SUGGESTIONS = 3;

const PLACE_ICON: Record<HomePlace, string> = { fridge: 'fridge', freezer: 'snow', cupboard: 'pantry', spices: 'leaf' };
/** How many things of the basket the card lists before "and N more". */
const BASKET_SHOWN = 6;

/**
 * The Kitchen tab (#/kitchen, also #/athome; design 2026-10-22, "Kitchen · one flow"): an overview
 * of how much is where that stays at the top and marks the section in view (tap to jump), then one
 * card each for the basket, fridge, freezer, cupboard and spices. Type (or scan) what was bought;
 * tap a thing to change how much is left, mark it running low or used up. Amounts go down by
 * themselves as meals and pots are logged. Recipes are one tap away in the header.
 */
export function KitchenPage() {
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
  const homeOn = isOn(d.settings.features, 'atHome');

  const items = all ?? [];
  const here = items.filter((i) => !left(i).out);
  const usedUp = items.filter((i) => left(i).out).sort((a, b) => a.name.localeCompare(b.name));
  const places = kitchenPlaces(here, d.batches);
  const toGet = (shopping ?? []).filter(isOpen);
  const trolley = (shopping ?? []).filter((s) => onList(s) && s.checkedAt !== undefined);

  // The overview: one tile per section shown, each counting what it holds.
  const sections: Array<{ key: string; label: string; icon: string; count: number }> = [
    ...(shoppingOn ? [{ key: 'basket', label: t('kitchen.basket'), icon: 'basket', count: toGet.length }] : []),
    ...(homeOn ? places.map((p) => ({ key: p.place, label: t(`kitchen.tile.${p.place}` as MessageKey), icon: PLACE_ICON[p.place], count: placeCount(p) })) : []),
  ];
  const refs = useRef(new Map<string, HTMLElement>());
  const tilesRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      // A section counts as in view once its top passes a quarter of the screen below the overview.
      const line = (tilesRef.current?.getBoundingClientRect().bottom ?? 0) + window.innerHeight / 4;
      const tops = sections.map((s) => refs.current.get(s.key)?.getBoundingClientRect().top ?? Infinity);
      setInView(sectionInView(tops, line));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });
  const jump = (key: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    refs.current.get(key)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const sectionRef = (key: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

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
    <section className="kitchen-page">
      <header className="page-head row-between">
        <h1 className="grow">{t('kitchen.title')}</h1>
        <a className="btn btn-small btn-secondary" href={href('recipes')}>
          <Icon name="recipes" size={18} /> {t('recipes.title')}
        </a>
        <SettingsButton />
      </header>

      {sections.length > 0 && (
        <nav className="kitchen-tiles" ref={tilesRef} aria-label={t('kitchen.overview')}>
          {sections.map((sec, i) => (
            <button key={sec.key} type="button" className={`kitchen-tile${i === inView ? ' on' : ''}`} aria-current={i === inView ? 'location' : undefined} onClick={() => jump(sec.key)}>
              <Icon name={sec.icon} size={22} />
              <strong>{sec.count}</strong>
              <span>{sec.label}</span>
            </button>
          ))}
        </nav>
      )}

      {homeOn && (
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
      )}
      {homeOn && showSuggestions && (
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

      {shoppingOn && (
        <div className="card kitchen-section" ref={sectionRef('basket')}>
          <div className="card-head">
            <h2>{t('kitchen.basket')}</h2>
            <a className="card-note" href={href('shopping')}>
              {t('kitchen.openBasket')}
            </a>
          </div>
          {toGet.length === 0 ? (
            <p className="muted small">{t('kitchen.basketEmpty')}</p>
          ) : (
            <ul className="plain-list shop-list">
              {toGet.slice(0, BASKET_SHOWN).map((i) => (
                <li key={i.id}>
                  <a className="home-row" href={href('shopping')}>
                    <span className="shop-text">
                      <span className="shop-name">{i.name}</span>
                    </span>
                    {amountText(i) && <span className="shop-amount">{amountText(i)}</span>}
                  </a>
                </li>
              ))}
              {toGet.length > BASKET_SHOWN && (
                <li>
                  <a className="home-row muted" href={href('shopping')}>
                    {t('kitchen.moreToGet', { n: toGet.length - BASKET_SHOWN })}
                  </a>
                </li>
              )}
            </ul>
          )}
          {homeOn && trolley.length > 0 && (
            <button className="btn btn-secondary btn-block" onClick={() => setPuttingAway(true)}>
              <Icon name="cart" size={18} /> {t('pantry.putAwayBasket', { n: trolley.length })}
            </button>
          )}
        </div>
      )}

      {homeOn && all && items.length === 0 && d.batches.every((b) => b.remaining.fresh + b.remaining.fridge + b.remaining.freezer === 0) && <p className="muted empty">{t('pantry.empty')}</p>}

      {homeOn &&
        places.map((p) => (
          <div key={p.place} className="card kitchen-section" ref={sectionRef(p.place)}>
            <div className="card-head">
              <h2>{placeName(p.place)}</h2>
            </div>
            {placeCount(p) === 0 ? (
              <p className="muted small">{t('kitchen.placeEmpty')}</p>
            ) : (
              <ul className="plain-list shop-list">
                {p.portions.map(({ batch, portions }) => (
                  <li key={batch.id}>
                    <PotRow batch={batch} portions={portions} place={p.place} />
                  </li>
                ))}
                {p.items.map((i) => (
                  <li key={i.id}>
                    <Row item={i} left={left(i)} onList={onShoppingList(i, shopping ?? [])} onEdit={() => setEditing(i)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

      {homeOn && usedUp.length > 0 && (
        <div className="card">
          <h2>{t('pantry.usedUpN', { n: usedUp.length })}</h2>
          <ul className="plain-list shop-list">
            {usedUp.map((i) => (
              <li key={i.id}>
                <Row item={i} left={left(i)} onList={onShoppingList(i, shopping ?? [])} onEdit={() => setEditing(i)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {homeOn && items.length > 0 && <p className="muted small pantry-hint">{t('pantry.hint')}</p>}

      {editing && <PantryItemSheet key={editing.id} item={editing} onClose={() => setEditing(null)} />}
      {scanning && <BarcodeSheet onFound={(p) => void addProduct(p)} onClose={() => setScanning(false)} />}
      {puttingAway && <PutAwaySheet onClose={() => setPuttingAway(false)} />}
    </section>
  );
}

/** Cooked portions kept in one place: the dish, how many, and its recipe one tap away. */
function PotRow({ batch, portions, place }: { batch: Batch; portions: number; place: HomePlace }) {
  return (
    <a className="home-row" href={href('recipes', batch.recipeId)}>
      <Icon name={place === 'freezer' ? 'snow' : 'pot'} size={18} />
      <span className="shop-text">
        <span className="shop-name">{batch.recipe.name}</span>
        <span className="small muted">{t('kitchen.cooked', { day: formatDay(batch.cookedDay) })}</span>
      </span>
      <span className="shop-amount">{t('kitchen.portions', { n: portions })}</span>
    </a>
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
