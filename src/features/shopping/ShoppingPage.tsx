import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
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

  return (
    <section className="shopping-page">
      <header className="page-head row-between">
        <a className="icon-btn" href={href()} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1 className="grow">{t('shopping.title')}</h1>
        <button className="icon-btn" onClick={() => void share()} disabled={toBuy.length === 0} aria-label={t('shopping.share')} title={t('shopping.share')}>
          <Icon name="share" />
        </button>
      </header>

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
      <button className="btn btn-secondary btn-block" onClick={() => setFromRecipe(true)}>
        <Icon name="recipes" size={18} /> {t('shopping.fromRecipe')}
      </button>

      {all && items.length === 0 && <p className="muted empty">{t('shopping.empty')}</p>}
      {bySection(toBuy).map((g) => (
        <div key={g.section}>
          <h2 className="section-title shop-section">{sectionName(g.section)}</h2>
          <ul className="plain-list shop-list">
            {g.items.map((i) => (
              <li key={i.id}>
                <Row item={i} onToggle={() => void toggle(i)} onEdit={() => setEditing(i)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {toBuy.length === 0 && basket.length > 0 && <p className="muted">{t('shopping.allInBasket')}</p>}

      {basket.length > 0 && (
        <>
          <div className="section-title row-between">
            <h2>{t('shopping.basket', { n: basket.length })}</h2>
            <button className="btn btn-small btn-ghost" onClick={() => void clear()}>
              {t('shopping.clear')}
            </button>
          </div>
          <ul className="plain-list shop-list">
            {basket.map((i) => (
              <li key={i.id}>
                <Row item={i} onToggle={() => void toggle(i)} onEdit={() => setEditing(i)} />
              </li>
            ))}
          </ul>
        </>
      )}
      {items.length > 0 && 'wakeLock' in navigator && <p className="muted small shop-awake">{t('shopping.screenOn')}</p>}

      {fromRecipe && <RecipeToListSheet onClose={() => setFromRecipe(false)} />}
      {editing && <ItemSheet key={editing.id} item={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** One line: tap to put it in the basket (or back), the pen to change it. */
function Row({ item, onToggle, onEdit }: { item: ShoppingItem; onToggle: () => void; onEdit: () => void }) {
  const done = item.checkedAt !== undefined;
  const amount = amountText(item);
  return (
    <div className={`shop-item${done ? ' done' : ''}`}>
      <button className="shop-row" role="checkbox" aria-checked={done} onClick={onToggle}>
        <span className={`shop-check${done ? ' on' : ''}`} aria-hidden>
          {done && <Icon name="check" size={16} />}
        </span>
        <span className="shop-text">
          <span className="shop-name">{item.name}</span>
          {item.recipes?.length ? <span className="muted small shop-for">{t('shopping.forRecipes', { names: item.recipes.join(', ') })}</span> : null}
        </span>
        {amount && <span className="shop-amount">{amount}</span>}
      </button>
      <button className="icon-btn shop-edit" onClick={onEdit} aria-label={t('shopping.editItem', { name: item.name })}>
        <Icon name="edit" size={18} />
      </button>
    </div>
  );
}
