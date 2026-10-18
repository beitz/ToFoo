import { useRef, useState } from 'react';
import { useData } from '../../app/data';
import { closeView, useBackCloses } from '../../app/history';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { productLabel } from '../../foods/products';
import { refKey } from '../../lib/refs';
import { addProposed, foodIngredient, ingredientLine, itemIngredient, productIngredient, type RecipeDraft } from '../../logic/ingredients';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import type { Ingredient, Product, Recipe, StoragePlan } from '../../storage/types';
import { Field, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { RecipeAssistant, type RecipeChat } from '../assistant/AssistantPage';
import { BarcodeSheet } from '../log/BarcodeSheet';
import type { PickedFood } from '../log/FoodPicker';
import { PreparationSelect } from '../log/PreparationSelect';
import { productTag } from '../log/ProductList';
import { IngredientSearch } from './IngredientSearch';
import { PortionNutrients } from './PortionNutrients';
import { PlanEditor } from './PlanEditor';
import { ProductIngredientSheet } from './ProductIngredientSheet';

/** Create or edit a recipe. Route: #/recipes/new or #/recipes/<id>/edit. */
export function RecipeEditor({ id }: { id?: string }) {
  const d = useData();
  const existing = id ? d.recipes.find((r) => r.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [portions, setPortions] = useState<number | undefined>(existing?.portions ?? 4);
  const [ingredients, setIngredients] = useState<Ingredient[]>(existing?.ingredients ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [tags, setTags] = useState((existing?.tags ?? []).join(', '));
  const [plan, setPlan] = useState<StoragePlan | undefined>(existing?.defaultPlan);
  const [saltOverride, setSaltOverride] = useState(existing?.saltOverride);
  const hasSalt = ingredients.some((i) => i.isSalt);
  const [picked, setPicked] = useState<Product | null>(null);
  const [scanning, setScanning] = useState(false);
  // The assistant replaces the form while open, but stays mounted once started, so going back to
  // the form and returning keeps the chat.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantStarted, setAssistantStarted] = useState(false);
  const ingredientsRef = useRef<HTMLHeadingElement>(null);
  const openRef = useRef(assistantOpen);
  openRef.current = assistantOpen;
  const assistantOn = isOn(d.settings.features, 'aiAssistant');
  useBackCloses(assistantOpen, () => {
    setAssistantOpen(false);
    // Back at the form: show the ingredients, where the assistant's additions landed.
    requestAnimationFrame(() => ingredientsRef.current?.scrollIntoView?.({ block: 'start' }));
  });

  function openAssistant() {
    setAssistantStarted(true);
    setAssistantOpen(true);
    window.scrollTo(0, 0);
  }

  function pick(p: PickedFood) {
    if (p.product) setPicked(p.product);
    else setIngredients((list) => [...list, foodIngredient(p.food, d.foods.version, d.profile.salt)]);
  }

  function addProduct(product: Product, grams: number) {
    setIngredients((list) => [...list, productIngredient(product, grams)]);
    setPicked(null);
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
      detail: match ? `${productTag(product)} · ${t('recipes.microsFrom', { name: match.nameEn })}` : productTag(product),
    };
  }

  // The chat reads the editor's latest state when it sends or adds, not the state it was opened with.
  const latest = useRef<RecipeDraft>({ name, portions, ingredients });
  latest.current = { name, portions, ingredients };
  const [recipeChat] = useState<RecipeChat>(() => ({
    soFar: () => {
      const r = latest.current;
      return {
        name: r.name.trim(),
        portions: r.portions,
        ingredients: r.ingredients.map((ing) => ingredientLine(ing, describeRef.current(ing).name)),
      };
    },
    add: (proposal) => {
      const before = latest.current;
      const added = proposal.items.map((it) => itemIngredient(it, d.foods.version, d.profile.salt));
      const next = addProposed(before, added, proposal);
      setName(next.name);
      setPortions(next.portions);
      setIngredients((list) => [...list, ...added]);
      return () => {
        setIngredients((list) => list.filter((ing) => !added.includes(ing)));
        if (next.name !== before.name) setName((n) => (n === next.name ? before.name : n));
        if (next.portions !== before.portions) setPortions((n) => (n === next.portions ? before.portions : n));
      };
    },
    // Only while the chat is shown: going back otherwise would leave the editor.
    done: () => openRef.current && closeView(),
  }));
  const describeRef = useRef(describe);
  describeRef.current = describe;
  const update = (i: number, patch: Partial<Ingredient>) => setIngredients((list) => list.map((ing, j) => (j === i ? { ...ing, ...patch } : ing)));
  const remove = (i: number) => setIngredients((list) => list.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) =>
    setIngredients((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

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
      <RecipeAssistant recipe={recipeChat} onClose={closeView} />
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
        <Field label={t('recipes.portionsLabel')}>{(fid) => <NumberInput id={fid} value={portions} onChange={setPortions} min={1} />}</Field>

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
                  <div>
                    <strong>{ingName}</strong>
                    <div className="muted small">{detail}</div>
                  </div>
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
              </li>
            );
          })}
        </ul>
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
              setPicked(product);
            }}
            onClose={() => setScanning(false)}
          />
        )}
        {picked && <ProductIngredientSheet product={picked} onAdd={addProduct} onClose={() => setPicked(null)} />}

        {hasSalt && (
          <div className="field">
            <label htmlFor="salt-choice">{t('recipes.saltChoice')}</label>
            <select
              id="salt-choice"
              value={saltOverride ? `${saltOverride.iodised ? 'i' : ''}${saltOverride.fluoridated ? 'f' : ''}` || 'plain' : 'default'}
              onChange={(e) => {
                const v = e.target.value;
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
