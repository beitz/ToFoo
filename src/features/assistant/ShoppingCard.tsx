import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { amountText, parseAmount, planAdd, recipeLines, type RecipeLine } from '../../logic/shopping';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { useShopFoods, useShopping } from '../shopping/useShopping';
import { useRegister, type Card, type CardProps, type Undo } from './cards';

/**
 * Things for the shopping list the assistant proposes (L1, …): what the user named, and the
 * ingredients of recipes from the book scaled to the portions planned, each one tickable, then
 * added to the list (the same thing stays one line there).
 */
export function ShoppingCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'shopping' }>>) {
  const { shopping } = card;
  const d = useData();
  const all = useShopping();
  const { typed, nameOf, sectionOf } = useShopFoods();
  /** The named things, then each recipe's ingredients under a line saying which recipe and how many portions. */
  const lines = useMemo((): Array<RecipeLine & { head?: string }> => {
    const named = shopping.items.map((i): RecipeLine => ({ item: { ...typed(i.name, all ?? []), ...parseAmount(i.amount ?? '') }, selected: true }));
    const fromRecipes = shopping.recipes.flatMap((r) => {
      const recipe = d.recipes.find((x) => x.id === r.recipeId);
      const own = recipe ? recipeLines(recipe, r.portions, nameOf, sectionOf) : [];
      return own.map((l, i) => (i === 0 ? { ...l, head: t('shopping.cardRecipe', { name: r.name, n: r.portions }) } : l));
    });
    return [...named, ...fromRecipes];
    // Sections of typed names follow what was bought before, which loads with the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopping, d.recipes, all === undefined]);
  const [off, setOff] = useState<ReadonlySet<number> | undefined>();
  const unticked = off ?? new Set(lines.flatMap((l, i) => (l.selected ? [] : [i])));
  const chosen = lines.filter((_, i) => !unticked.has(i));
  const [saving, setSaving] = useState(false);

  async function save(): Promise<Undo | undefined> {
    if (!chosen.length || saving) return;
    setSaving(true);
    try {
      const now = Date.now();
      const undo = await repo.changeShopping((items) => planAdd(items, chosen.map((l) => l.item), now, newId, CURRENT_SCHEMA_VERSION));
      onLogged(true, { added: chosen.map((l) => [l.item.name, amountText(l.item)].filter(Boolean).join(' ')) });
      return async () => {
        await repo.undoShopping(undo);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(shopping.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t('shopping.added', { n: chosen.length }), undo);
  }

  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>
          {t('shopping.added', { n: chosen.length })} <a href={href('shopping')}>{t('shopping.openList')}</a>
        </span>
      </div>
    );
  }

  const toggle = (i: number) => {
    const next = new Set(unticked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setOff(next);
  };

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="cart" size={18} /> {t('shopping.title')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {shopping.id}
        </span>
      </div>
      <ul className="plain-list shop-pick">
        {lines.map((l, i) => (
          <li key={i}>
            {l.head && <p className="muted small shop-card-head">{l.head}</p>}
            <button className="shop-row" role="checkbox" aria-checked={!unticked.has(i)} onClick={() => toggle(i)}>
              <span className={`shop-check${unticked.has(i) ? '' : ' on'}`} aria-hidden>
                {!unticked.has(i) && <Icon name="check" size={16} />}
              </span>
              <span className="shop-text">
                <span className="shop-name">{l.item.name}</span>
              </span>
              <span className="muted small shop-amount">{amountText(l.item)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!chosen.length || saving} onClick={() => void saveOne()}>
          {t('shopping.addN', { n: chosen.length })}
        </button>
      </div>
    </div>
  );
}
