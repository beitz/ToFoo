import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { localTimes } from '../../ai/chatRecord';
import type { ProposedChange } from '../../ai/tools';
import { t } from '../../i18n';
import { dayKey, formatDay, formatTime } from '../../lib/dates';
import { fmtGrams, fmtNumber } from '../../lib/format';
import { applyChanges, cookedWeight, potShare, stockPortionsFor, type IngredientChange } from '../../logic/batch';
import { itemIngredient } from '../../logic/ingredients';
import { bookingSlot, nextStorage } from '../../logic/stock';
import { resolvePlan } from '../../storage/defaults';
import { repo } from '../../storage/repo';
import type { Batch, Ingredient, Profile, StoragePlan } from '../../storage/types';
import { Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { PortionFields, portionDraftValid, type PortionDraft } from '../log/PortionFields';
import { TimeField } from '../log/TimeField';
import { defaultTimeFor } from '../log/time';
import { initialPot } from '../recipes/BatchSheet';
import { IngredientChanges } from '../recipes/IngredientChanges';
import { PlanEditor } from '../recipes/PlanEditor';
import { PotWeight, type PotScale } from '../recipes/PotWeight';
import { useRegister, type Card, type CardProps, type Undo } from './cards';

/** The assistant's changes as ingredient changes (salt becomes the kitchen's salt, as everywhere). */
function asChanges(changes: readonly ProposedChange[], version: string, salt: Profile['salt']): IngredientChange[] {
  return changes.map((c) => ({ ...(c.replaces ? { replaces: c.replaces } : {}), ...(c.item ? { ingredient: itemIngredient(c.item, version, salt) } : {}) }));
}

/** Products the assistant brought in that the saved ingredients use, saved on this phone so entries can refer to them. */
async function saveChangedProducts(changes: readonly ProposedChange[], used: readonly Ingredient[]) {
  const ids = new Set(used.map((i) => (i.ref.source === 'OFF' || i.ref.source === 'USDA' ? `${i.ref.source}:${i.ref.code}` : '')));
  for (const c of changes) {
    const p = c.item?.product;
    if (!p || !ids.has(p.id)) continue;
    await repo.saveProduct(p);
    await repo.setProductMatch(p.id, p.match ?? null);
  }
}

const when = (time: number) => `${new Date(time).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(time)}`;

function Assumptions({ list }: { list: string[] }) {
  if (list.length === 0) return null;
  return (
    <div className="small">
      <span className="muted">{t('ai.assumptions')}</span>
      <ul className="assumptions">
        {list.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A serving from a batch in stock (P1, …): the amount (portions, or grams of a weighed pot), where
 * it was stored, the serving's own changes ("with tofu instead of the beef") and the time, all
 * editable as when logging from the log screen.
 */
export function PortionCard({ card, day, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'portion' }>>) {
  const { portion: proposal } = card;
  const d = useData();
  const batch = d.batchesById.get(proposal.batchId);
  const [time, setTime] = useState(() => proposal.time ?? defaultTimeFor(day, d.today));
  const [draft, setDraft] = useState<PortionDraft | undefined>(() => {
    if (!batch) return undefined;
    const storage = bookingSlot(batch, nextStorage(batch, dayKey(new Date(time))) ?? 'freezer');
    const grams = proposal.grams && batch.cookedGrams ? proposal.grams : undefined;
    const portions = grams ? stockPortionsFor(grams, batch) : proposal.portions || 1;
    const changed = proposal.changes.length ? applyChanges(batch.recipe.ingredients, asChanges(proposal.changes, d.foods.version, d.profile.salt), potShare({ portions, grams }, batch)) : undefined;
    return { storage, portions, ...(grams ? { grams } : {}), ...(changed ? { ingredients: changed } : {}) };
  });
  const [saving, setSaving] = useState(false);
  const valid = !!batch && !!draft && portionDraftValid(draft, batch);

  async function save(): Promise<Undo | undefined> {
    if (!valid || saving || !batch || !draft) return;
    setSaving(true);
    try {
      if (draft.ingredients) await saveChangedProducts(proposal.changes, draft.ingredients);
      const grams = draft.grams && batch.cookedGrams ? draft.grams : undefined;
      const entry = await repo.addLog({
        kind: 'portion',
        batchId: batch.id,
        storage: draft.storage,
        portions: draft.portions,
        ...(grams ? { grams } : {}),
        ...(draft.ingredients ? { ingredients: draft.ingredients } : {}),
        time,
        day: dayKey(new Date(time)),
        confidence: 'A',
        label: batch.recipe.name,
      });
      onLogged(true, localTimes({ time, batch: batch.recipe.name, batchId: batch.id, storage: draft.storage, portions: draft.portions, ...(grams ? { grams } : {}), changed: !!draft.ingredients }));
      return async () => {
        await repo.deleteLog(entry.id);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(proposal.id, card.logged ? undefined : save, register);

  async function log() {
    const undo = await save();
    if (undo) toast(t('ai.logged'), undo);
  }

  const name = batch?.recipe.name ?? proposal.name;
  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>
          {t('ai.cardLogged', { name, when: when(time) })} <a href={href('diary', dayKey(new Date(time)))}>{t('edit.inDiary')}</a>
        </span>
      </div>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="snow" size={18} /> {name}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {proposal.id}
        </span>
      </div>
      {!batch || !draft ? (
        <p className="notice small" role="alert">
          {t('ai.batchGoneHint')}
        </p>
      ) : (
        <>
          <p className="muted small">{t('stock.cooked', { day: formatDay(batch.cookedDay, d.today) })}</p>
          <PortionFields batch={batch} value={draft} onChange={(patch) => setDraft((v) => (v ? { ...v, ...patch } : v))} />
        </>
      )}
      <Assumptions list={proposal.assumptions} />
      <TimeField value={time} onChange={setTime} />
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!valid || saving} onClick={() => void log()}>
          {t('ai.log')}
        </button>
      </div>
    </div>
  );
}

/**
 * A batch cooked of a recipe in the book (B1, …): the day, the storage plan, the pot's weight, what
 * this pot had instead of the recipe, and what was eaten of it right away. Saving cooks the batch
 * (and logs that serving), with one undo.
 */
export function BatchCard({ card, day, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'batch' }>>) {
  const { batch: proposal } = card;
  const d = useData();
  const recipe = d.recipes.find((r) => r.id === proposal.recipeId);
  const [cookDay, setCookDay] = useState(proposal.day ?? day);
  const [plan, setPlan] = useState<StoragePlan>(() => (proposal.plan ? { ...proposal.plan, freezer: null } : (recipe?.defaultPlan ?? d.settings.defaultPlan)));
  const [pot, setPot] = useState<PotScale>(() => {
    const remembered = recipe?.potGrams ?? d.settings.potGrams;
    if (proposal.potGrams) return { full: proposal.potGrams, empty: remembered };
    if (proposal.foodGrams) return initialPot(proposal.foodGrams, remembered);
    return { empty: remembered };
  });
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => {
    if (!recipe) return [];
    return (proposal.changes.length ? applyChanges(recipe.ingredients, asChanges(proposal.changes, d.foods.version, d.profile.salt), 1) : undefined) ?? recipe.ingredients;
  });
  const [eat, setEat] = useState(!!proposal.ate);
  const [ateTime, setAteTime] = useState(() => proposal.ate?.time ?? defaultTimeFor(day, d.today));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Batch>();
  const cooked = cookedWeight(pot.full, pot.empty);
  const valid = !!recipe && ingredients.length > 0 && ingredients.every((i) => i.grams > 0) && (!pot.full || cooked !== undefined);
  const ate = proposal.ate;
  // Grams eaten count only from a weighed pot; otherwise one portion stands in.
  const ateGrams = ate?.grams && cooked ? ate.grams : undefined;
  const ateText = ate ? (ateGrams ? fmtGrams(ateGrams) : t('entry.portions', { n: fmtNumber(ate.portions || 1, 2) })) : '';

  async function save(): Promise<Undo | undefined> {
    if (!valid || saving || !recipe) return;
    setSaving(true);
    try {
      await saveChangedProducts(proposal.changes, ingredients);
      const batch = await repo.cookBatch(recipe, resolvePlan(plan, recipe.portions), cookDay, undefined, { ingredients, ...(cooked ? { cookedGrams: cooked, emptyPotGrams: pot.empty } : {}) });
      let entryId: string | undefined;
      if (ate && eat) {
        const portions = ateGrams ? stockPortionsFor(ateGrams, batch) : ate.portions || 1;
        const storage = bookingSlot(batch, nextStorage(batch, dayKey(new Date(ateTime))) ?? 'fresh');
        const entry = await repo.addLog({ kind: 'portion', batchId: batch.id, storage, portions, ...(ateGrams ? { grams: ateGrams } : {}), time: ateTime, day: dayKey(new Date(ateTime)), confidence: 'A', label: batch.recipe.name });
        entryId = entry.id;
      }
      setSaved(batch);
      onLogged(true, localTimes({ recipe: recipe.name, recipeId: recipe.id, batchId: batch.id, day: cookDay, plan: batch.plan, ...(cooked ? { cookedGrams: cooked } : {}), changed: !!batch.recipeIngredients, ...(entryId ? { ate: ateText, ateTime } : {}) }));
      return async () => {
        if (entryId) await repo.deleteLog(entryId);
        await repo.deleteBatch(batch.id);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(proposal.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t('recipes.cooked', { n: recipe?.portions ?? 0 }), undo);
  }

  const name = recipe?.name ?? proposal.name;
  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>
          {t('ai.batchSavedDone', { name, day: formatDay(cookDay, d.today) })} {(saved?.recipeId ?? recipe?.id) && <a href={href('recipes', saved?.recipeId ?? recipe!.id)}>{t('ai.openRecipe')}</a>}
        </span>
      </div>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="pot" size={18} /> {t('ai.batchTitle', { name })}
        </strong>
        <span className="muted small" title={t('ai.cardIdBatch')}>
          {proposal.id}
        </span>
      </div>
      {!recipe ? (
        <p className="notice small" role="alert">
          {t('ai.recipeGone')}
        </p>
      ) : (
        <>
          <div className="field">
            <label htmlFor={`cook-${proposal.id}`}>{t('recipes.cookDay')}</label>
            <input id={`cook-${proposal.id}`} type="date" value={cookDay} max={d.today} onChange={(e) => e.target.value && setCookDay(e.target.value)} />
          </div>
          <PlanEditor plan={plan} portions={recipe.portions} onChange={setPlan} />
          <h3 className="section-title">{t('batch.weighTitleOptional')}</h3>
          <PotWeight value={pot} portions={recipe.portions} onChange={setPot} />
          {proposal.changes.length > 0 && (
            <>
              <h3 className="section-title">{t('batch.potIngredients')}</h3>
              <IngredientChanges original={recipe.ingredients} value={ingredients} scale={1} gramsLabel={t('batch.gramsInPot')} onChange={setIngredients} />
            </>
          )}
          {ate && (
            <>
              <Toggle checked={eat} onChange={setEat} label={t('ai.batchAte', { amount: ateText })} />
              {eat && <TimeField value={ateTime} onChange={setAteTime} />}
            </>
          )}
        </>
      )}
      <Assumptions list={proposal.assumptions} />
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!valid || saving} onClick={() => void saveOne()}>
          {t('ai.saveBatch')}
        </button>
      </div>
    </div>
  );
}
