import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { itemSummary } from '../../ai/chatRecord';
import type { ProposedItem } from '../../ai/tools';
import { productLabel } from '../../foods/products';
import { t, type MessageKey } from '../../i18n';
import { fmtNumber, fmtPercent } from '../../lib/format';
import { refKey } from '../../lib/refs';
import { itemIngredient } from '../../logic/ingredients';
import { checkPortion, portionIntake, topGaps, type PortionCheck } from '../../logic/recipeIdeas';
import { repo } from '../../storage/repo';
import type { Ingredient, Recipe } from '../../storage/types';
import { Field, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { IngredientSheet } from '../recipes/IngredientSheet';
import { SourceTag } from '../recipes/SourceTag';
import { useRegister, type Card, type CardProps, type Undo } from './cards';

type Item = Omit<ProposedItem, 'grams'> & { grams: number | undefined };

const itemKey = (it: Pick<ProposedItem, 'food' | 'product'>) => (it.product ? it.product.id : `BLS:${it.food.code}`);

/**
 * A recipe the assistant proposes for the recipe book: one the user cooked, an idea (with its reason
 * line), or a change to a recipe already in the book (marked against it). The app's own numbers
 * for one portion sit under it, so a reason that does not match them shows. Saving adds the recipe
 * (or replaces the recipe's ingredients), with undo; batches cooked before keep their own copy.
 */
export function RecipeCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'recipe' }>>) {
  const { recipe: proposal } = card;
  const d = useData();
  const existing = proposal.recipeId ? d.recipes.find((r) => r.id === proposal.recipeId) : undefined;
  const [name, setName] = useState(proposal.name);
  const [portions, setPortions] = useState<number | undefined>(proposal.portions);
  const [items, setItems] = useState<Item[]>(proposal.items);
  const [instructions, setInstructions] = useState(proposal.instructions ?? '');
  const [editing, setEditing] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string>();
  const changing = !!proposal.recipeId;
  const valid = !!name.trim() && !!portions && portions >= 1 && Number.isInteger(portions) && items.length > 0 && items.every((i) => i.grams && i.grams > 0) && (!changing || !!existing);

  const ingredients = (list: readonly Item[]): Ingredient[] =>
    list.filter((it) => it.grams && it.grams > 0).map((it) => itemIngredient({ ...it, grams: it.grams! }, d.foods.version, d.profile.salt));

  // The app's numbers for one portion, live as the user edits; for a change also the recipe as it is.
  const check = useMemo(() => {
    const ctx = { foods: d.foods, products: new Map([...d.productsById, ...items.flatMap((it) => (it.product ? [[it.product.id, it.product] as const] : []))]), batches: new Map(), customFoods: new Map(), salt: d.profile.salt };
    const now = portions && portions >= 1 ? checkPortion(portionIntake({ name, portions, ingredients: ingredients(items) }, ctx), d.model.nutrients, d.requirements) : undefined;
    const before = existing ? checkPortion(portionIntake(existing, { ...ctx, salt: existing.saltOverride ?? d.profile.salt }), d.model.nutrients, d.requirements) : undefined;
    return { now, before };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, portions, existing, d.foods, d.productsById, d.profile.salt, d.model, d.requirements]);

  async function save(): Promise<Undo | undefined> {
    if (!valid || saving) return;
    setSaving(true);
    try {
      // Products and USDA foods are saved on this phone, as when a meal is logged, so the recipe can refer to them.
      for (const it of items) {
        if (!it.product) continue;
        await repo.saveProduct(it.product);
        await repo.setProductMatch(it.product.id, it.product.match ?? null);
      }
      const fields = { name: name.trim(), portions: portions!, ingredients: ingredients(items) };
      const summary = { name: fields.name, portions: fields.portions, items: items.map(itemSummary), ...(instructions.trim() ? { instructions: instructions.trim() } : {}) };
      if (existing) {
        const old: Recipe = existing;
        await repo.saveRecipe({ ...old, ...fields, instructions: instructions.trim() || old.instructions });
        setSavedId(old.id);
        onLogged(true, { ...summary, recipeId: old.id });
        return async () => {
          await repo.restoreRecipe(old);
          onLogged(false);
        };
      }
      const rec = await repo.saveRecipe({ ...fields, ...(instructions.trim() ? { instructions: instructions.trim() } : {}), tags: [], defaultPlan: d.settings.defaultPlan });
      setSavedId(rec.id);
      onLogged(true, { ...summary, recipeId: rec.id });
      return async () => {
        await repo.deleteRecipe(rec.id);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(proposal.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t(changing ? 'ai.recipeUpdated' : 'ai.recipeSaved', { name: name.trim() }), undo);
  }

  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>
          {t(changing ? 'ai.recipeUpdatedDone' : 'ai.recipeSavedDone', { name: name.trim() })} {savedId && <a href={href('recipes', savedId)}>{t('ai.openRecipe')}</a>}
        </span>
      </div>
    );
  }

  // Against the recipe as it is: what is new, what changed amount, what is gone.
  const old = new Map(existing?.ingredients.map((i) => [refKey(i.ref), i] as const) ?? []);
  const kept = new Set(items.map(itemKey));
  const removed = existing ? existing.ingredients.filter((i) => !kept.has(refKey(i.ref))) : [];
  const kcal = check.now?.kcal;

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="pot" size={18} /> {t(changing ? 'ai.recipeChangeTitle' : proposal.kind === 'idea' ? 'ai.recipeIdeaTitle' : 'ai.recipeNewTitle')}
        </strong>
        <span className="muted small" title={t('ai.cardIdRecipeBook')}>
          {proposal.id}
        </span>
      </div>
      {proposal.reason && <p className="idea-reason">{proposal.reason}</p>}
      {changing && !existing && (
        <p className="notice small" role="alert">
          {t('ai.recipeGone')}
        </p>
      )}
      <div className="recipe-card-head">
        <Field label={t('recipes.name')}>{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('recipes.portionsLabel')}>{(id) => <NumberInput id={id} value={portions} onChange={setPortions} min={1} />}</Field>
      </div>
      <ul className="plain-list">
        {items.map((it, i) => {
          const before = old.get(itemKey(it));
          const tag = !existing ? undefined : !before ? t('ai.recipeItemNew') : before.grams !== it.grams ? t('ai.recipeItemWas', { grams: fmtNumber(before.grams, 1) }) : undefined;
          return (
            <li key={`${itemKey(it)}-${i}`} className="proposal-item">
              <button className="proposal-name ingredient-name" onClick={() => setEditing(i)} aria-label={t('recipes.changeIngredient', { name: it.product ? productLabel(it.product) : it.food.nameEn })}>
                <span className="link-like">
                  {it.product ? productLabel(it.product) : it.food.nameEn} <Icon name="edit" size={14} />
                </span>
                <span className="muted small block">
                  <SourceTag source={it.product?.source ?? 'BLS'} product={it.product} /> {it.note || it.food.nameDe}
                  {it.preparation !== 'asListed' && ` · ${t(`prep.${it.preparation}` as MessageKey)}`}
                </span>
                {tag && <span className="change-tag small">{tag}</span>}
              </button>
              <NumberInput value={it.grams} onChange={(g) => setItems((all) => all.map((x, j) => (j === i ? { ...x, grams: g } : x)))} suffix="g" min={0} />
              <button className="icon-btn" aria-label={t('ai.removeItem', { name: it.food.nameEn })} onClick={() => setItems((all) => all.filter((_, j) => j !== i))}>
                <Icon name="trash" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      {removed.length > 0 && (
        <p className="small">
          <span className="muted">{t('ai.recipeRemoved')}</span> <span className="removed-items">{removed.map((r) => r.name).join(', ')}</span>
        </p>
      )}
      {editing !== undefined && items[editing] && (
        <IngredientSheet
          key={editing}
          initial={items[editing]!}
          onSave={(saved) => {
            setItems((all) => all.map((x, j) => (j === editing ? { ...x, ...saved, product: saved.product } : x)));
            setEditing(undefined);
          }}
          onRemove={() => {
            setItems((all) => all.filter((_, j) => j !== editing));
            setEditing(undefined);
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
      {proposal.assumptions.length > 0 && (
        <div className="small">
          <span className="muted">{t('ai.assumptions')}</span>
          <ul className="assumptions">
            {proposal.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {(proposal.instructions !== undefined || !changing) && (
        <div className="field">
          <label htmlFor={`steps-${proposal.id}`}>{t('recipes.instructions')}</label>
          <textarea id={`steps-${proposal.id}`} className="note-text steps-text" rows={proposal.instructions ? 4 : 2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          {changing && <div className="field-hint">{t('ai.stepsReplaceRecipe')}</div>}
        </div>
      )}
      {check.now && <PortionLine now={check.now} before={check.before} />}
      <p className="muted small">{t('ai.correctHintRecipeBook')}</p>
      <div className="sheet-actions">
        {kcal !== undefined && <span className="muted">{t('ai.kcalPerPortion', { kcal: fmtNumber(Math.round(kcal)) })}</span>}
        <button className="btn btn-primary" disabled={!valid || saving} onClick={() => void saveOne()}>
          {t(changing ? 'ai.updateRecipe' : 'ai.saveRecipe')}
        </button>
      </div>
    </div>
  );
}

/** The app's own numbers for one portion: the current gaps it helps most, and for a change, before → after. */
function PortionLine({ now, before }: { now: PortionCheck; before?: PortionCheck }) {
  const gaps = topGaps(now);
  const high = now.high.filter((h) => h.share >= 0.2).slice(0, 2);
  if (gaps.length === 0 && high.length === 0) return null;
  const was = (id: string) => before?.gaps.find((g) => g.id === id) ?? before?.high.find((g) => g.id === id);
  const part = (g: { id: string; name: string; share: number }) => {
    const b = was(g.id);
    return b && Math.round(b.share * 100) !== Math.round(g.share * 100) ? `${g.name} ${fmtPercent(b.share)} → ${fmtPercent(g.share)}` : `${g.name} ${fmtPercent(g.share)}`;
  };
  return (
    <div className="portion-line small">
      <span className="muted">{t('ai.portionGives')}</span>
      {gaps.length > 0 && <span className="block">{t('ai.portionGaps', { list: gaps.map(part).join(', ') })}</span>}
      {high.length > 0 && <span className="block">{t('ai.portionHigh', { list: high.map(part).join(', ') })}</span>}
    </div>
  );
}
