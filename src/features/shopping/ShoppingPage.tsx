import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { errorText } from '../../lib/shareFile';
import { search } from '../../foods/search';
import type { Food } from '../../foods/foodDb';
import { amountText, bySection, isOpen, onList, parseEntry, planAdd, planClear, sectionOfCode, shareText, suggestions, type NewShoppingItem } from '../../logic/shopping';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION, type ShoppingItem } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { ItemSheet, sectionName } from './ItemSheet';
import { RecipeToListSheet } from './RecipeToListSheet';
import { useShopFoods, useShopping } from './useShopping';
import { useWakeLock } from './useWakeLock';
import { isOn } from '../../settings/features';
import { needsBuying, onShoppingList } from '../../logic/pantry';
import { PutAwaySheet } from '../pantry/PutAwaySheet';
import { placeName, usePantry, usePantryFoods, usePantryLeft } from '../pantry/usePantry';
import { useGaps } from '../recipes/useGaps';
import { portionGrams } from '../../model/ranking';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { BackButton } from '../../ui/BackButton';

/** Foods from the database offered while typing, after things bought before. */
const FOOD_SUGGESTIONS = 3;

/**
 * Route #/shopping: the shopping list. Everything is on the phone, so it works in a shop without
 * a connection. Type to add (things bought before come back as suggestions), add a recipe's
 * ingredients, tap a line to put it in the basket, clear the basket after shopping.
 */
export function ShoppingPage() {
  const d = useData();
  const toast = useToast();
  const all = useShopping();
  const [text, setText] = useState('');
  const [fromRecipe, setFromRecipe] = useState(false);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [puttingAway, setPuttingAway] = useState(false);
  const atHome = isOn(d.settings.features, 'atHome');
  const pantry = usePantry();
  const left = usePantryLeft();
  const { asShopping, placeOf } = usePantryFoods();
  // Running low or used up at home and not on the list yet (marking it puts it on; eating it up does not).
  const needed = atHome ? (pantry ?? []).filter((p) => needsBuying(left(p)) && !onShoppingList(p, all ?? [])).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const { typed } = useShopFoods();
  const items = useMemo(() => (all ?? []).filter(onList), [all]);
  const toBuy = items.filter(isOpen);
  const basket = items.filter((i) => i.checkedAt !== undefined).sort((a, b) => b.checkedAt! - a.checkedAt!);
  useWakeLock(items.length > 0);

  const entry = parseEntry(text);
  const past = useMemo(() => suggestions(all ?? [], entry.name), [all, entry.name]);
  const foods = useMemo(() => {
    if (!entry.name.trim()) return [];
    return search(d.searchIndex, entry.name, { limit: 12, recent: d.recentFoods, boost: d.searchBoost })
      .map((r) => d.foods.byCode.get(r.key))
      .filter((f): f is Food => !!f && !past.some((p) => p.ref?.source === 'BLS' && p.ref.code === f.code))
      .slice(0, FOOD_SUGGESTIONS);
  }, [entry.name, past, d.searchIndex, d.recentFoods, d.searchBoost, d.foods]);

  async function add(item: NewShoppingItem) {
    const withAmount = { ...item, ...(entry.grams ? { grams: entry.grams } : {}), ...(entry.amount ? { amount: entry.amount } : {}) };
    await repo.changeShopping((current) => planAdd(current, [withAmount], Date.now(), newId, CURRENT_SCHEMA_VERSION));
    setText('');
  }

  async function addNeeded(names: readonly string[]) {
    const things = needed.filter((p) => names.includes(p.id));
    const undo = await repo.changeShopping((current) =>
      planAdd(
        current,
        things.map((p) => asShopping(p, current)),
        Date.now(),
        newId,
        CURRENT_SCHEMA_VERSION,
      ),
    );
    toast(t('shopping.added', { n: things.length }), () => repo.undoShopping(undo));
  }

  async function toggle(item: ShoppingItem) {
    const next = { ...item };
    if (item.checkedAt === undefined) next.checkedAt = Date.now();
    else delete next.checkedAt;
    await repo.changeShopping(() => ({ put: [next], remove: [] }));
  }

  async function clear() {
    const undo = await repo.changeShopping((current) => planClear(current, Date.now()));
    toast(t('shopping.cleared', { n: basket.length }), () => repo.undoShopping(undo));
  }

  async function share() {
    const body = shareText(items, t('shopping.title'), sectionName);
    try {
      if (navigator.share) await navigator.share({ text: body });
      else {
        await navigator.clipboard.writeText(body);
        toast(t('shopping.copied'));
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast(t('shopping.shareFailed', { error: errorText(e) }));
    }
  }

  const showSuggestions = entry.name.trim() !== '' && (past.length > 0 || foods.length > 0);
  const done = items.length > 0 ? basket.length / items.length : 0;

  return (
    <section className="shopping-page">
      <header className="page-head row-between">
        <BackButton to={['kitchen']} />
        <h1 className="grow">{t('shopping.title')}</h1>
        <span className="offline-pill small">
          <Icon name="check" size={14} /> {t('shopping.offline')}
        </span>
        <button className="icon-btn" onClick={() => void share()} disabled={toBuy.length === 0} aria-label={t('shopping.share')} title={t('shopping.share')}>
          <Icon name="share" />
        </button>
      </header>
      {items.length > 0 && (
        <div className="shop-progress">
          <span className="shop-bar" aria-hidden>
            <span style={{ width: `${done * 100}%` }} />
          </span>
          <span className="small muted">{t('shopping.progress', { get: toBuy.length, trolley: basket.length })}</span>
        </div>
      )}

      {needed.length > 0 && (
        <div className="card shop-needed">
          <div className="row-between">
            <h2 className="shop-needed-title">
              <Icon name="pantry" size={18} /> {t('pantry.needed')}
            </h2>
            {needed.length > 1 && (
              <button className="btn btn-small btn-ghost" onClick={() => void addNeeded(needed.map((p) => p.id))}>
                {t('pantry.addAllToList')}
              </button>
            )}
          </div>
          <ul className="plain-list">
            {needed.map((p) => (
              <li key={p.id}>
                <button className="shop-row" onClick={() => void addNeeded([p.id])} aria-label={t('pantry.addToList', { name: p.name })}>
                  <span className="shop-check" aria-hidden>
                    <Icon name="plus" size={16} />
                  </span>
                  <span className="shop-text">
                    <span className="shop-name">{p.name}</span>
                  </span>
                  <span className="muted small shop-amount">{left(p).out ? t('pantry.out') : t('pantry.low')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {all && items.length === 0 && <p className="muted empty">{t('shopping.empty')}</p>}
      {/* Ticked things stay in their section (design 2026-10-22), after what is still to get. */}
      {bySection(items).map((g) => (
        <div key={g.section}>
          <h2 className="shop-section">{sectionName(g.section)}</h2>
          <ul className="plain-list shop-list">
            {[...g.items.filter(isOpen), ...g.items.filter((i) => !isOpen(i))].map((i) => (
              <li key={i.id}>
                <Row item={i} goesTo={atHome && !isOpen(i) ? placeName(placeOf(i.name, i.ref)) : undefined} onToggle={() => void toggle(i)} onEdit={() => setEditing(i)} />
              </li>
            ))}
          </ul>
        </div>
      ))}

      {basket.length > 0 && (
        <div className="card shop-trolley">
          <span className="grow">{t('shopping.basket', { n: basket.length })}</span>
          {atHome && (
            <button className="btn btn-small btn-secondary" onClick={() => setPuttingAway(true)}>
              <Icon name="pantry" size={16} /> {t('shopping.putAway')}
            </button>
          )}
          <button className="btn btn-small btn-ghost" onClick={() => void clear()}>
            {t('shopping.clear')}
          </button>
        </div>
      )}
      <button className="btn btn-secondary btn-block" onClick={() => setFromRecipe(true)}>
        <Icon name="recipes" size={18} /> {t('shopping.fromRecipe')}
      </button>
      {items.length > 0 && 'wakeLock' in navigator && <p className="muted small shop-awake">{t('shopping.screenOn')}</p>}

      <div className="shop-dock">
        {showSuggestions && (
          <ul className="result-list shop-suggestions" aria-label={t('shopping.suggestions')}>
            {past.map((p) => (
              <li key={p.id}>
                <button className="result" onClick={() => void add({ name: p.name, section: p.section, ...(p.ref ? { ref: p.ref } : {}) })}>
                  <span className="result-name">{p.name}</span>
                  <span className="muted small">{t('shopping.boughtBefore')}</span>
                </button>
              </li>
            ))}
            {foods.map((f) => (
              <li key={f.code}>
                <button className="result" onClick={() => void add({ name: f.nameEn, ref: { source: 'BLS', version: d.foods.version, code: f.code }, section: sectionOfCode(f.code) })}>
                  <span className="result-name">{f.nameEn}</span>
                  <span className="muted small">{f.nameDe}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="shop-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (entry.name.trim()) void add(typed(entry.name.trim(), all ?? []));
          }}
        >
          <div className="search-box grow">
            <Icon name="plus" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('shopping.addPlaceholder')} aria-label={t('shopping.addPlaceholder')} enterKeyHint="done" autoComplete="off" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={!entry.name.trim()}>
            {t('shopping.add')}
          </button>
        </form>
      </div>

      {fromRecipe && <RecipeToListSheet onClose={() => setFromRecipe(false)} />}
      {editing && <ItemSheet key={editing.id} item={editing} onClose={() => setEditing(null)} />}
      {puttingAway && <PutAwaySheet onClose={() => setPuttingAway(false)} />}
    </section>
  );
}

/**
 * One line as a card (design 2026-10-22, "Basket in the shop"): tap to put it in the trolley (or
 * back), the pen to change it. Under the name: the recipes it is for, else which of the user's gaps
 * a portion of it fills, else that it was typed. A ticked line says where it goes at home.
 */
function Row({ item, goesTo, onToggle, onEdit }: { item: ShoppingItem; goesTo?: string; onToggle: () => void; onEdit: () => void }) {
  const fills = useFills(item);
  const done = item.checkedAt !== undefined;
  const amount = amountText(item);
  return (
    <div className={`shop-item${done ? ' done' : ''}`}>
      <button className="shop-row" role="checkbox" aria-checked={done} onClick={onToggle}>
        <span className={`shop-check${done ? ' on' : ''}`} aria-hidden>
          {done && <Icon name="check" size={16} />}
        </span>
        <span className="shop-text">
          <span className="shop-name">
            {item.name}
            {amount && <span className="shop-amount"> {amount}</span>}
          </span>
          <span className="muted small shop-for">
            {item.recipes?.length ? (
              <>
                <Icon name="pot" size={14} /> {t('shopping.forRecipes', { names: item.recipes.join(', ') })}
              </>
            ) : fills.length ? (
              <>
                <Icon name="target" size={14} /> {t('shopping.fills', { names: fills.join(', ') })}
              </>
            ) : !item.ref ? (
              <>
                <Icon name="edit" size={14} /> {t('shopping.typed')}
              </>
            ) : null}
          </span>
        </span>
        {goesTo && <span className="shop-goes small">→ {goesTo}</span>}
      </button>
      <button className="icon-btn shop-edit" onClick={onEdit} aria-label={t('shopping.editItem', { name: item.name })}>
        <Icon name="edit" size={18} />
      </button>
    </div>
  );
}

/** A gap this item fills: one usual portion of its food gives at least this share of a day's need. */
const FILLS_SHARE = 0.1;

/** The user's gaps (low or a bit low) one portion of the item's food fills well, biggest first, at most two. */
function useFills(item: ShoppingItem): string[] {
  const d = useData();
  const gaps = useGaps();
  return useMemo(() => {
    const food = item.ref?.source === 'BLS' ? d.foods.byCode.get(item.ref.code) : undefined;
    if (!food) return [];
    const grams = portionGrams(food.per100);
    return [...gaps.keys()]
      .flatMap((id) => {
        const v = food.per100[id];
        const req = d.requirements.byNutrient.get(id);
        if (typeof v !== 'number' || !req) return [];
        const share = (v * grams) / 100 / req.recommended;
        return share >= FILLS_SHARE ? [{ id, share }] : [];
      })
      .sort((a, b) => b.share - a.share)
      .slice(0, 2)
      .map((x) => (NUTRIENT_BY_ID.get(x.id)?.name ?? x.id).replace(/ \(.*\)$/, ''));
  }, [item.ref, gaps, d.foods, d.requirements]);
}
