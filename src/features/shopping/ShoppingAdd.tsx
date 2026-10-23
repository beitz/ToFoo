import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { search } from '../../foods/search';
import type { Food } from '../../foods/foodDb';
import { parseEntry, planAdd, sectionOfCode, suggestions, type NewShoppingItem } from '../../logic/shopping';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { useShopFoods, useShopping } from './useShopping';

/** Foods from the database offered while typing, after things bought before. */
const FOOD_SUGGESTIONS = 3;

/**
 * Type what to get, with things bought before and foods from the database as suggestions. On the
 * shopping list it is docked at the bottom with its suggestions above (`docked`); on the Kitchen
 * card the suggestions open below and each add says so with undo, since the card shows only the
 * first few lines.
 */
export function ShoppingAdd({ docked, autoFocus }: { docked?: boolean; autoFocus?: boolean }) {
  const d = useData();
  const toast = useToast();
  const all = useShopping();
  const { typed } = useShopFoods();
  const [text, setText] = useState('');

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
    const undo = await repo.changeShopping((current) => planAdd(current, [withAmount], Date.now(), newId, CURRENT_SCHEMA_VERSION));
    setText('');
    if (!docked) toast(t('shopping.addedOne', { name: withAmount.name }), () => repo.undoShopping(undo));
  }

  const showSuggestions = entry.name.trim() !== '' && (past.length > 0 || foods.length > 0);
  const list = showSuggestions && (
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
  );
  const form = (
    <form
      className="shop-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (entry.name.trim()) void add(typed(entry.name.trim(), all ?? []));
      }}
    >
      <div className="search-box grow">
        <Icon name="plus" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('shopping.addPlaceholder')} aria-label={t('shopping.addPlaceholder')} enterKeyHint="done" autoComplete="off" autoFocus={autoFocus} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={!entry.name.trim()}>
        {t('shopping.add')}
      </button>
    </form>
  );
  return docked ? (
    <div className="shop-dock">
      {list}
      {form}
    </div>
  ) : (
    <>
      {form}
      {list}
    </>
  );
}
