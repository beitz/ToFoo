import { useMemo, useRef, useState } from 'react';
import { useData } from '../../app/data';
import { useBackCloses } from '../../app/history';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { productFood, productLabel } from '../../foods/products';
import { fmtGrams } from '../../lib/format';
import { refKey } from '../../lib/refs';
import { addProposed, foodIngredient, ingredientLine, itemIngredient, type RecipeDraft } from '../../logic/ingredients';
import { moveChange, recordChange, type Change, type LastChange, type RecipeState } from '../../logic/swapPreview';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import type { Ingredient, Product, Recipe, StoragePlan } from '../../storage/types';
import { Field, NumberInput, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { RecipeAssistant, type RecipeChat } from '../assistant/AssistantPage';
import { BarcodeSheet } from '../log/BarcodeSheet';
import type { PickedFood } from '../log/FoodPicker';
import { PreparationSelect, prepLabel } from '../log/PreparationSelect';
import { SourceTag } from './SourceTag';
import { IngredientSearch } from './IngredientSearch';
import { PortionNutrients } from './PortionNutrients';
import { PlanEditor } from './PlanEditor';
import { IngredientSheet, type IngredientDraft, type SavedIngredient } from './IngredientSheet';
import { IngredientSwapLine, SwapLine, SwapPreview, usePortionMove } from './SwapPreview';

/** Create or edit a recipe. Route: #/recipes/new or #/recipes/<id>/edit. */
export function RecipeEditor({ id }: { id?: string }) {
  const d = useData();
  const existing = id ? d.recipes.find((r) => r.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [portions, setPortions] = useState<number | undefined>(existing?.portions ?? 4);
  const [ingredients, setIngredients] = useState<Ingredient[]>(existing?.ingredients ?? []);
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [tags, setTags] = useState((existing?.tags ?? []).join(', '));
  const [plan, setPlan] = useState<StoragePlan | undefined>(existing?.defaultPlan);
  const [saltOverride, setSaltOverride] = useState(existing?.saltOverride);
  const hasSalt = ingredients.some((i) => i.isSalt);
  // Swap preview: the recipe now against the recipe just before the latest change (or as saved).
  const state = useMemo<RecipeState>(() => ({ portions, ingredients, ...(saltOverride ? { saltOverride } : {}) }), [portions, ingredients, saltOverride]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const savedState = useMemo<RecipeState | undefined>(
    () => existing && { portions: existing.portions, ingredients: existing.ingredients, ...(existing.saltOverride ? { saltOverride: existing.saltOverride } : {}) },
    [existing],
  );
  const [last, setLast] = useState<LastChange>();
  const [compare, setCompare] = useState<'change' | 'saved'>('change');
  /** Called before an edit is applied, so the state read here is the recipe before it. */
  const note = (change: Change) => setLast((l) => recordChange(l, change, stateRef.current));
  /** The ingredient sheet: adding a product (no index) or changing ingredient `index`. */
  const [sheet, setSheet] = useState<{ index?: number; initial: IngredientDraft; label?: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  // The assistant replaces the form while open, but stays mounted once started, so going back to
  // the form and returning keeps the chat.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantStarted, setAssistantStarted] = useState(false);
  const ingredientsRef = useRef<HTMLHeadingElement>(null);
  const openRef = useRef(assistantOpen);
  openRef.current = assistantOpen;
  const assistantOn = isOn(d.settings.features, 'aiAssistant');
  function closeAssistant() {
    setAssistantOpen(false);
    // Back at the form: show the ingredients, where the assistant's additions landed.
    requestAnimationFrame(() => ingredientsRef.current?.scrollIntoView?.({ block: 'start' }));
  }
  useBackCloses(assistantOpen, closeAssistant);

  function openAssistant() {
    setAssistantStarted(true);
    setAssistantOpen(true);
    window.scrollTo(0, 0);
  }

  // A BLS food is added at once (its grams are typed in the list); a product first shows its label
  // and the food for its missing micronutrients.
  function pick(p: PickedFood) {
    if (p.product) openProduct(p.product);
    else {
      note({ kind: 'ingredient', index: stateRef.current.ingredients.length });
      setIngredients((list) => [...list, foodIngredient(p.food, d.foods.version, d.profile.salt)]);
    }
  }

  function openProduct(product: Product) {
    setSheet({ initial: { food: productFood(product, d.foods), product, preparation: 'asListed' } });
  }

  /** The sheet's starting point for an ingredient in the list. */
  function draftOf(ing: Ingredient): IngredientDraft {
    if (ing.ref.source === 'BLS') return { food: d.foods.byCode.get(ing.ref.code), grams: ing.grams || undefined, preparation: ing.preparation };
    const product = d.productsById.get(refKey(ing.ref));
    return { ...(product ? { food: productFood(product, d.foods), product } : {}), grams: ing.grams || undefined, preparation: ing.preparation };
  }

  function saveSheet(saved: SavedIngredient) {
    const ing = itemIngredient(saved, d.foods.version, d.profile.salt);
    const index = sheet?.index;
    const list = stateRef.current.ingredients;
    note(index === undefined ? { kind: 'ingredient', index: list.length } : { kind: 'ingredient', index, ...(list[index] ? { was: list[index] } : {}) });
    setIngredients((list) => (index === undefined ? [...list, ing] : list.map((x, j) => (j === index ? ing : x))));
    setSheet(null);
  }

  /** Display name and second line of an ingredient: the food's names, or the product's label and source. */
  function describe(ing: Ingredient): { name: string; detail: string } {
    if (ing.isSalt) return { name: t('recipes.salt'), detail: t('recipes.saltHint') };
    if (ing.ref.source === 'BLS') {
      const food = d.foods.byCode.get(ing.ref.code);
      return {
        name: food?.nameEn ?? ing.name,
        detail: food?.nameDe ?? t('recipes.missingFood'),
      };
    }
    const product = d.productsById.get(refKey(ing.ref));
    if (!product) return { name: ing.name, detail: t('recipes.missingFood') };
    const match = product.match ? d.foods.byCode.get(product.match.code) : undefined;
    return {
      name: productLabel(product),
      detail: match ? t('recipes.microsFromLine', { name: match.nameEn }) : '',
    };
  }

  // The chat reads the editor's latest state when it sends or adds, not the state it was opened with.
  const latest = useRef<RecipeDraft>({ name, portions, ingredients, instructions });
  latest.current = { name, portions, ingredients, instructions };
  const [recipeChat] = useState<RecipeChat>(() => ({
    soFar: () => {
      const r = latest.current;
      return {
        name: r.name.trim(),
        portions: r.portions,
        ingredients: r.ingredients.map((ing) => ingredientLine(ing, describeRef.current(ing).name)),
        instructions: r.instructions.trim(),
      };
    },
    add: (proposal) => {
      const before = latest.current;
      const added = proposal.items.map((it) => itemIngredient(it, d.foods.version, d.profile.salt));
      const next = addProposed(before, added, proposal);
      if (added.length) note({ kind: 'assistant', added: added.length });
      setName(next.name);
      setPortions(next.portions);
      setIngredients((list) => [...list, ...added]);
      setInstructions(next.instructions);
      return () => {
        setIngredients((list) => list.filter((ing) => !added.includes(ing)));
        if (next.name !== before.name) setName((n) => (n === next.name ? before.name : n));
        if (next.portions !== before.portions) setPortions((n) => (n === next.portions ? before.portions : n));
        if (next.instructions !== before.instructions) setInstructions((x) => (x === next.instructions ? before.instructions : x));
      };
    },
    // Only while the chat is shown: going back otherwise would leave the editor.
    done: () => openRef.current && closeAssistant(),
  }));
  const describeRef = useRef(describe);
  describeRef.current = describe;
  const update = (i: number, patch: Partial<Ingredient>) => {
    const was = stateRef.current.ingredients[i];
    note({ kind: 'ingredient', index: i, ...(was ? { was } : {}) });
    setIngredients((list) => list.map((ing, j) => (j === i ? { ...ing, ...patch } : ing)));
  };
  const remove = (i: number) => {
    const was = stateRef.current.ingredients[i];
    if (was) note({ kind: 'removed', was });
    setIngredients((list) => list.filter((_, j) => j !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stateRef.current.ingredients.length) return;
    setLast((l) => moveChange(l, i, j));
    setIngredients((list) => {
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  };
  const changePortions = (v: number | undefined) => {
    note({ kind: 'portions', ...(portions !== undefined ? { was: portions } : {}) });
    setPortions(v);
  };

  /** "100 g" or "250 ml" (a product sold by volume). */
  const amountOf = (ing: Ingredient) => (d.productsById.get(refKey(ing.ref))?.perMl ? `${Math.round(ing.grams)} ml` : fmtGrams(ing.grams));

  /** The latest change in words: "Adding 100 g Spinach", "200 g Beef → 150 g Tofu", "Portions: 4 → 6". */
  function changeTitle(c: Change): { text: string; pending?: boolean } {
    if (c.kind === 'removed') return { text: t('swap.removed', { amount: amountOf(c.was), name: describe(c.was).name }) };
    if (c.kind === 'portions') return { text: t('swap.portions', { was: c.was ?? '–', now: portions ?? '–' }) };
    if (c.kind === 'salt') return { text: t('swap.salt') };
    if (c.kind === 'assistant') return { text: t('swap.assistant', { n: c.added }) };
    const now = ingredients[c.index];
    if (!now) return { text: '' };
    const name = describe(now).name;
    if (!c.was) return now.grams > 0 ? { text: t('swap.adding', { amount: amountOf(now), name }) } : { text: t('swap.addingNoAmount', { name }), pending: true };
    const was = c.was;
    const prep = was.preparation !== now.preparation;
    const side = (ing: Ingredient) => `${amountOf(ing)}${prep ? `, ${prepLabel(ing.preparation).toLowerCase()}` : ''}`;
    if (refKey(was.ref) !== refKey(now.ref)) return { text: t('swap.swapped', { was: `${side(was)} ${describe(was).name}`, now: `${side(now)} ${name}` }) };
    if (was.grams === now.grams && !prep) return { text: t('swap.unchanged', { name }) };
    if (now.grams === 0) return { text: t('swap.noAmount', { name }), pending: true };
    return { text: t('swap.changed', { name, was: side(was), now: side(now) }) };
  }

  const changeMove = usePortionMove(last?.before ?? state, state);
  const savedMove = usePortionMove(savedState ?? state, state);
  const title = last && changeTitle(last.change);

  const valid = name.trim() && portions && portions >= 1 && ingredients.length > 0 && ingredients.every((i) => i.grams > 0);
  const draft: Recipe | null = valid
    ? {
        id: existing?.id ?? 'draft',
        schemaVersion: 1,
        name: name.trim(),
        portions: Math.round(portions!),
        ingredients,
        tags: [],
        saltOverride,
        createdAt: 0,
        updatedAt: 0,
      }
    : null;

  async function save() {
    if (!valid) return;
    const rec = await repo.saveRecipe({
      id: existing?.id,
      createdAt: existing?.createdAt,
      name: name.trim(),
      portions: Math.round(portions!),
      ingredients,
      instructions: instructions.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      defaultPlan: plan,
      saltOverride: hasSalt ? saltOverride : undefined,
    });
    navigate('recipes', rec.id);
  }

  const assistant = assistantStarted && (
    <div hidden={!assistantOpen}>
      <RecipeAssistant recipe={recipeChat} onClose={closeAssistant} />
    </div>
  );

  return (
    <>
      {assistant}
      {/* Hidden, not unmounted, while the assistant is open: the search and any open sheet stay as they were. */}
      <section hidden={assistantOpen}>
        <header className="page-head row">
          <a className="icon-btn" href={existing ? href('recipes', existing.id) : href('recipes')} aria-label={t('common.back')}>
            <Icon name="back" />
          </a>
          <h1>{existing ? t('recipes.edit') : t('recipes.new')}</h1>
        </header>

        <Field label={t('recipes.name')}>{(fid) => <input id={fid} value={name} onChange={(e) => setName(e.target.value)} placeholder="Linsencurry" />}</Field>
        <Field label={t('recipes.portionsLabel')}>{(fid) => <NumberInput id={fid} value={portions} onChange={changePortions} min={1} />}</Field>

        <h2 className="section-title" ref={ingredientsRef}>
          {t('recipes.ingredientsTitle')}
        </h2>
        <p className="muted small">{t('recipes.ingredientsHint')}</p>
        <ul className="plain-list ingredient-list">
          {ingredients.map((ing, i) => {
            const { name: ingName, detail } = describe(ing);
            return (
              <li key={`${refKey(ing.ref)}-${i}`} className="card ingredient">
                <div className="row-between">
                  <button className="ingredient-name" onClick={() => setSheet({ index: i, initial: draftOf(ing), label: ing.name })} aria-label={t('recipes.changeIngredient', { name: ingName })}>
                    <strong>
                      {ingName} <Icon name="edit" size={14} />
                    </strong>
                    <span className="muted small block">
                      {!ing.isSalt && <SourceTag source={ing.ref.source} product={d.productsById.get(refKey(ing.ref))} />} {detail}
                    </span>
                  </button>
                  <div className="row">
                    <button className="icon-btn" onClick={() => move(i, -1)} aria-label={t('recipes.moveUp')} disabled={i === 0}>
                      ↑
                    </button>
                    <button className="icon-btn" onClick={() => remove(i)} aria-label={t('common.delete')}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </div>
                <div className="grid-2">
                  <Field label={t('log.amount')}>
                    {(fid) => <NumberInput id={fid} value={ing.grams || undefined} onChange={(v) => update(i, { grams: v ?? 0 })} suffix="g" min={0} autoFocus={ing.grams === 0} />}
                  </Field>
                  <PreparationSelect id={`prep-${i}`} hint={false} value={ing.preparation} onChange={(p) => update(i, { preparation: p })} />
                </div>
                {last?.change.kind === 'ingredient' && last.change.index === i && <SwapLine move={changeMove} />}
              </li>
            );
          })}
        </ul>
        {last && (
          <SwapPreview title={compare === 'saved' ? t('swap.sinceSaved') : title?.text} move={compare === 'saved' ? savedMove : changeMove} pending={compare === 'change' && title?.pending}>
            {savedState && (
              <Segmented
                label={t('swap.compareWith')}
                value={compare}
                onChange={setCompare}
                options={[
                  { value: 'change', label: t('swap.thisChange') },
                  { value: 'saved', label: t('swap.savedRecipe') },
                ]}
              />
            )}
          </SwapPreview>
        )}
        {assistantOn && (
          <button className="btn btn-secondary btn-block assistant-entry" onClick={openAssistant}>
            <Icon name="camera" /> {t('recipes.assistant')}
          </button>
        )}
        <IngredientSearch onPick={pick} onScan={() => setScanning(true)} />
        {scanning && (
          <BarcodeSheet
            onFound={(product) => {
              setScanning(false);
              openProduct(product);
            }}
            onClose={() => setScanning(false)}
          />
        )}
        {sheet && (
          <IngredientSheet
            key={sheet.index ?? 'new'}
            initial={sheet.initial}
            label={sheet.label}
            preview={(item) => <IngredientSwapLine state={state} index={sheet.index} item={item} />}
            onSave={saveSheet}
            onRemove={
              sheet.index === undefined
                ? undefined
                : () => {
                    remove(sheet.index!);
                    setSheet(null);
                  }
            }
            onClose={() => setSheet(null)}
          />
        )}

        {hasSalt && (
          <div className="field">
            <label htmlFor="salt-choice">{t('recipes.saltChoice')}</label>
            <select
              id="salt-choice"
              value={saltOverride ? `${saltOverride.iodised ? 'i' : ''}${saltOverride.fluoridated ? 'f' : ''}` || 'plain' : 'default'}
              onChange={(e) => {
                const v = e.target.value;
                note({ kind: 'salt' });
                setSaltOverride(
                  v === 'default'
                    ? undefined
                    : {
                        iodised: v.includes('i'),
                        fluoridated: v.includes('f'),
                      },
                );
              }}
            >
              <option value="default">{t('recipes.saltDefault')}</option>
              <option value="i">{t('recipes.saltIodised')}</option>
              <option value="if">{t('recipes.saltIodisedFluoride')}</option>
              <option value="plain">{t('recipes.saltPlain')}</option>
            </select>
          </div>
        )}

        <Field label={t('recipes.instructions')} hint={t(assistantOn ? 'recipes.instructionsHintAi' : 'recipes.instructionsHint')}>
          {(fid) => <textarea id={fid} className="steps-text" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />}
        </Field>

        <h2 className="section-title">{t('recipes.storagePlan')}</h2>
        <PlanEditor plan={plan ?? d.settings.defaultPlan} portions={portions ?? 1} onChange={setPlan} />

        <Field label={t('recipes.notes')}>{(fid) => <textarea id={fid} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <Field label={t('recipes.tags')} hint={t('recipes.tagsHint')}>
          {(fid) => <input id={fid} value={tags} onChange={(e) => setTags(e.target.value)} />}
        </Field>

        {draft && (
          <>
            <h2 className="section-title">{t('recipes.perPortion')}</h2>
            <PortionNutrients recipe={draft} />
          </>
        )}

        <div className="sticky-actions">
          <button className="btn btn-primary btn-block" disabled={!valid} onClick={() => void save()}>
            {t('common.save')}
          </button>
          {!valid && <p className="muted small">{t('recipes.incomplete')}</p>}
        </div>
      </section>
    </>
  );
}
