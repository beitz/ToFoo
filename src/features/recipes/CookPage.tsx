import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { formatTime } from '../../lib/dates';
import { fmtGrams } from '../../lib/format';
import { newId } from '../../lib/id';
import { cookedWeight, MAX_POT_PORTIONS } from '../../logic/batch';
import { boxesOf, nextBox, planOf, resizeBoxes, startPot, takenFromHome, withPot, type Box } from '../../logic/cooking';
import { resolvePlan } from '../../storage/defaults';
import { repo } from '../../storage/repo';
import type { Ingredient, Pot, Recipe } from '../../storage/types';
import { isOn } from '../../settings/features';
import { Field, NumberInput, Sheet, Toggle } from '../../ui/controls';
import { DateInput } from '../../ui/DateInputs';
import { Icon } from '../../ui/Icon';
import { defaultTimeFor } from '../log/time';
import { leftLabel, placeName, usePantry } from '../pantry/usePantry';
import { IngredientChanges } from './IngredientChanges';

const STEPS = ['gather', 'cook', 'weigh', 'store'] as const;
type Step = (typeof STEPS)[number];

/** Everything typed while cooking, kept on the phone until Done, so a reload or a call does not lose it. */
interface Draft {
  startedAt: number;
  step: Step;
  day: string;
  ingredients: Ingredient[];
  full?: number;
  /** The empty pot: a named one, or just a weight; 0 = the food weighed on its own. */
  potId?: string;
  empty?: number;
  boxes: Box[];
  remember: boolean;
}

const draftKey = (recipeId: string) => `tofoo.cook.${recipeId}`;

/** A cooking left open longer than this was not finished: the next one starts afresh. */
const DRAFT_MAX_MS = 12 * 60 * 60 * 1000;

function loadDraft(recipeId: string): Draft | undefined {
  try {
    const raw = localStorage.getItem(draftKey(recipeId));
    const draft = raw ? (JSON.parse(raw) as Draft) : undefined;
    return draft && Date.now() - draft.startedAt < DRAFT_MAX_MS ? draft : undefined;
  } catch {
    return undefined;
  }
}

function saveDraft(recipeId: string, draft: Draft | undefined) {
  try {
    if (draft) localStorage.setItem(draftKey(recipeId), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(recipeId));
  } catch {
    // Private mode or storage full: cooking still works, it just is not kept across a reload.
  }
}

const BOX_ICON: Record<Box, string> = { now: 'cup', fridge: 'fridge', freezer: 'snow' };

/**
 * Cook a batch (design 2026-10-22, "Cook a batch"), a full-screen task in four steps: what goes in
 * the pot, the recipe's steps, weigh and split into boxes (each box Eat now, Fridge or Freezer),
 * and what it takes from home. Done saves the batch and logs what is eaten now, with one undo.
 */
export function CookPage({ id }: { id: string }) {
  const d = useData();
  const recipe = d.recipes.find((r) => r.id === id);
  if (!recipe) {
    return (
      <section>
        <p>{t('recipes.notFound')}</p>
        <a href={href('kitchen')}>{t('common.back')}</a>
      </section>
    );
  }
  return <Cooking recipe={recipe} />;
}

function Cooking({ recipe }: { recipe: Recipe }) {
  const d = useData();
  const toast = useToast();
  const pantry = usePantry();
  const [draft, setDraft] = useState<Draft>(() => {
    const kept = loadDraft(recipe.id);
    if (kept) return kept;
    const start = startPot(recipe, d.settings);
    return {
      startedAt: Date.now(),
      step: 'gather',
      day: d.today,
      ingredients: recipe.ingredients,
      ...(start.pot ? { potId: start.pot.id } : {}),
      ...(start.grams ? { empty: start.grams } : {}),
      boxes: boxesOf(resolvePlan(recipe.defaultPlan ?? d.settings.defaultPlan, recipe.portions)),
      remember: false,
    };
  });
  const [potSheet, setPotSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    saveDraft(recipe.id, draft);
  }, [recipe.id, draft]);
  const set = (patch: Partial<Draft>) => setDraft((x) => ({ ...x, ...patch }));

  const n = draft.boxes.length;
  const cooked = cookedWeight(draft.full, draft.empty);
  const weightBad = draft.full !== undefined && draft.full > 0 && cooked === undefined;
  const ingredientsOk = draft.ingredients.length > 0 && draft.ingredients.every((i) => i.grams > 0);
  const valid = ingredientsOk && !weightBad && n >= 1;
  const plan = planOf(draft.boxes);
  const pot = (d.settings.pots ?? []).find((p) => p.id === draft.potId);
  const homeOn = isOn(d.settings.features, 'atHome');
  const taken = useMemo(() => (homeOn && pantry ? takenFromHome(draft.ingredients, pantry, d.log, d.batches, Date.now()) : []), [homeOn, pantry, draft.ingredients, d.log, d.batches]);
  const stepIndex = STEPS.indexOf(draft.step);

  function close() {
    navigate('recipes', recipe.id);
  }

  function startOver() {
    saveDraft(recipe.id, undefined);
    const start = startPot(recipe, d.settings);
    setDraft({
      startedAt: Date.now(),
      step: 'gather',
      day: d.today,
      ingredients: recipe.ingredients,
      ...(start.pot ? { potId: start.pot.id } : {}),
      ...(start.grams ? { empty: start.grams } : {}),
      boxes: boxesOf(resolvePlan(recipe.defaultPlan ?? d.settings.defaultPlan, recipe.portions)),
      remember: false,
    });
  }

  async function done() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const batch = await repo.cookBatch(recipe, plan, draft.day, draft.remember ? { fresh: plan.fresh, fridge: plan.fridge, freezer: null } : undefined, {
        ingredients: draft.ingredients,
        portions: n,
        ...(cooked ? { cookedGrams: cooked, emptyPotGrams: draft.empty, potId: draft.potId ?? '' } : {}),
      });
      // Boxes marked "Eat now" are eaten fresh: logged with the batch, as one serving.
      const time = defaultTimeFor(draft.day, d.today);
      const entry =
        plan.fresh > 0 ? await repo.addLog({ kind: 'portion', batchId: batch.id, storage: 'fresh', portions: plan.fresh, time, day: draft.day, confidence: 'A', label: recipe.name }) : undefined;
      saveDraft(recipe.id, undefined);
      toast(t('cook.doneToast', { name: recipe.name, n }), async () => {
        if (entry) await repo.deleteLog(entry.id);
        await repo.deleteBatch(batch.id);
      });
      navigate('recipes', recipe.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="cook-page">
      <header className="page-head row cook-head">
        <button type="button" className="icon-btn" onClick={close} aria-label={t('cook.close')}>
          <Icon name="close" />
        </button>
        <div className="grow">
          <h1 className="cook-title">{t('cook.title', { name: recipe.name })}</h1>
          <p className="muted small">{t('cook.started', { time: formatTime(draft.startedAt) })}</p>
        </div>
      </header>
      <ol className="cook-steps" aria-label={t('cook.stepsLabel')}>
        {STEPS.map((s, i) => (
          <li key={s} className={`${i < stepIndex ? 'done' : ''}${s === draft.step ? ' on' : ''}`}>
            <button type="button" aria-current={s === draft.step ? 'step' : undefined} onClick={() => set({ step: s })}>
              <span className="cook-step-bar" aria-hidden />
              {t(`cook.step.${s}` as MessageKey)}
            </button>
          </li>
        ))}
      </ol>

      {draft.step === 'gather' && (
        <div className="card">
          <Field label={t('recipes.cookDay')}>{(fid) => <DateInput id={fid} value={draft.day} max={d.today} onChange={(e) => e.target.value && set({ day: e.target.value })} />}</Field>
          <h2 className="section-title">{t('batch.whatGoesIn')}</h2>
          <p className="muted small">{t('batch.cookChangesHint')}</p>
          <IngredientChanges original={recipe.ingredients} value={draft.ingredients} scale={1} gramsLabel={t('batch.gramsInPot')} onChange={(ingredients) => set({ ingredients })} />
        </div>
      )}

      {draft.step === 'cook' && (
        <div className="card">
          <h2>{t('recipes.instructions')}</h2>
          {recipe.instructions?.trim() ? (
            <ol className="cook-instructions">
              {recipe.instructions
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l, i) => (
                  <li key={i}>{l.replace(/^\d+[.)]\s*/, '')}</li>
                ))}
            </ol>
          ) : (
            <p className="muted small">
              {t('cook.noSteps')} <a href={href('recipes', recipe.id, 'edit')}>{t('recipeView.edit')}</a>
            </p>
          )}
        </div>
      )}

      {draft.step === 'weigh' && (
        <>
          <div className="card">
            <h2>{t('cook.weighTitle')}</h2>
            <div className="cook-full">
              <Icon name="pot" />
              <label htmlFor="cook-full" className="grow">
                {t('cook.fullPot')}
              </label>
              <NumberInput id="cook-full" value={draft.full} onChange={(full) => set({ full })} suffix="g" min={0} placeholder="0" />
            </div>
            <div className="cook-line">
              <span className="cook-op" aria-hidden>
                −
              </span>
              <span className="grow">
                {draft.empty === 0 ? t('cook.noPot') : pot ? pot.name : t('cook.emptyPot')}
                {pot && <span className="muted small"> · {t('cook.remembered')}</span>}
              </span>
              <strong>{draft.empty !== undefined ? fmtGrams(draft.empty) : '–'}</strong>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setPotSheet(true)}>
                {t('cook.changePot')}
              </button>
            </div>
            <div className="cook-line cook-total">
              <span className="cook-op" aria-hidden>
                =
              </span>
              <span className="grow">{t('cook.foodInPot')}</span>
              <strong role="status">{cooked !== undefined ? fmtGrams(cooked) : '–'}</strong>
            </div>
            {weightBad && (
              <p className="notice small" role="alert">
                <Icon name="alert" size={14} /> {t('batch.weightImplausible')}
              </p>
            )}
            {draft.full === undefined && <p className="muted small">{t('cook.weighHint')}</p>}
          </div>

          <div className="card">
            <div className="row-between">
              <h2>{t('cook.splitTitle')}</h2>
              <div className="stepper" role="group" aria-label={t('batch.potPortions')}>
                <button type="button" className="icon-btn" disabled={n <= 1} onClick={() => set({ boxes: resizeBoxes(draft.boxes, n - 1) })} aria-label={t('cook.fewer')}>
                  <Icon name="minus" />
                </button>
                <strong className="stepper-n" aria-live="polite">
                  {n}
                </strong>
                <button type="button" className="icon-btn" disabled={n >= MAX_POT_PORTIONS} onClick={() => set({ boxes: resizeBoxes(draft.boxes, n + 1) })} aria-label={t('cook.more')}>
                  <Icon name="plus" />
                </button>
              </div>
            </div>
            <p className="small">{cooked ? t('cook.each', { grams: fmtGrams(cooked / n) }) : t('cook.tapBox')}</p>
            <div className="cook-boxes">
              {draft.boxes.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  className={`cook-box cook-box-${b}`}
                  onClick={() => set({ boxes: draft.boxes.map((x, j) => (j === i ? nextBox(x) : x)) })}
                  aria-label={t('cook.boxSpoken', { n: i + 1, where: t(`cook.box.${b}` as MessageKey) })}
                >
                  <Icon name={BOX_ICON[b]} size={22} />
                  <span>{t(`cook.box.${b}` as MessageKey)}</span>
                </button>
              ))}
            </div>
            <p className="cook-summary small">
              <span>{t('cook.sumNow', { n: plan.fresh })}</span>
              <span>{t('cook.sumFridge', { n: plan.fridge })}</span>
              <span>{t('cook.sumFreezer', { n: plan.freezer })}</span>
            </p>
            <Toggle checked={draft.remember} onChange={(remember) => set({ remember })} label={t('recipes.rememberPlan')} />
          </div>
        </>
      )}

      {draft.step === 'store' && (
        <div className="card">
          <div className="card-head">
            <h2>{t('cook.takenTitle')}</h2>
            <span className="card-note">{t('cook.takenNote')}</span>
          </div>
          {!homeOn ? (
            <p className="muted small">{t('cook.homeOff')}</p>
          ) : taken.length === 0 ? (
            <p className="muted small">{t('cook.takenNone')}</p>
          ) : (
            <ul className="plain-list cook-taken">
              {taken.map((u) => (
                <li key={u.item.id}>
                  <span className="grow">
                    {u.ingredient.name} −{fmtGrams(u.ingredient.grams)}
                  </span>
                  <span className="muted small">{placeName(u.item.place)}</span>
                  <strong>{u.after.out ? t('cook.none') : leftLabel(u.item, u.after)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="cook-nav">
        {draft.step !== 'gather' && (
          <button type="button" className="btn btn-ghost" onClick={() => set({ step: STEPS[stepIndex - 1]! })}>
            {t('cook.back')}
          </button>
        )}
        {draft.step !== 'store' ? (
          <button type="button" className="btn btn-primary grow" disabled={draft.step === 'gather' && !ingredientsOk} onClick={() => set({ step: STEPS[stepIndex + 1]! })}>
            {t('cook.next', { step: t(`cook.step.${STEPS[stepIndex + 1]!}` as MessageKey) })}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-big grow" disabled={!valid || saving} onClick={() => void done()}>
            {plan.fresh > 0 ? t('cook.doneEat', { now: plan.fresh, store: n - plan.fresh }) : t('cook.doneStore', { n })}
          </button>
        )}
      </div>
      {draft.step === 'store' && <p className="muted small center">{t('cook.doneNote')}</p>}
      {!valid && draft.step === 'store' && <p className="notice small">{t(weightBad ? 'batch.weightImplausible' : 'cook.fixIngredients')}</p>}
      <button type="button" className="btn btn-small btn-ghost cook-over" onClick={startOver}>
        {t('cook.startOver')}
      </button>

      {potSheet && (
        <PotSheet
          current={draft.potId}
          empty={draft.empty}
          onPick={(p) => {
            set(p ? { potId: p.id, empty: p.grams } : { potId: undefined, empty: 0 });
            setPotSheet(false);
          }}
          onWeight={(grams) => {
            set({ potId: undefined, empty: grams });
            setPotSheet(false);
          }}
          onClose={() => setPotSheet(false)}
        />
      )}
    </section>
  );
}

/**
 * Choose the empty pot: one remembered by name, a new one (name and weight, kept for next time),
 * just a weight, or none (the food weighed on its own).
 */
function PotSheet({ current, empty, onPick, onWeight, onClose }: { current?: string; empty?: number; onPick: (pot: Pot | undefined) => void; onWeight: (grams: number) => void; onClose: () => void }) {
  const d = useData();
  const pots = d.settings.pots ?? [];
  const [name, setName] = useState('');
  const [grams, setGrams] = useState<number | undefined>(current ? undefined : empty || undefined);

  async function add() {
    if (!name.trim() || !grams || !(grams > 0)) return;
    const pot: Pot = { id: newId(), name, grams };
    const next = withPot(pots, pot);
    await repo.updateSettings({ pots: next });
    onPick(next.find((p) => p.id === pot.id));
  }

  return (
    <Sheet title={t('cook.potTitle')} onClose={onClose}>
      <ul className="plain-list pot-list">
        {pots.map((p) => (
          <li key={p.id}>
            <button type="button" className={`pot-choice${p.id === current ? ' on' : ''}`} aria-pressed={p.id === current} onClick={() => onPick(p)}>
              <span className="grow">{p.name}</span>
              <strong>{fmtGrams(p.grams)}</strong>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className={`pot-choice${!current && empty === 0 ? ' on' : ''}`} aria-pressed={!current && empty === 0} onClick={() => onPick(undefined)}>
            <span className="grow">{t('cook.noPot')}</span>
            <strong>0 g</strong>
          </button>
        </li>
      </ul>
      <h3 className="section-title">{t('cook.newPot')}</h3>
      <div className="grid-2">
        <Field label={t('cook.potName')}>{(fid) => <input id={fid} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('cook.potNamePlaceholder')} />}</Field>
        <Field label={t('batch.emptyPot')}>{(fid) => <NumberInput id={fid} value={grams} onChange={setGrams} suffix="g" min={0} placeholder="0" />}</Field>
      </div>
      <p className="muted small">{t('cook.potHint')}</p>
      <div className="sheet-actions">
        <button type="button" className="btn btn-secondary" disabled={!grams || !(grams > 0)} onClick={() => grams && onWeight(grams)}>
          {t('cook.justWeight')}
        </button>
        <button type="button" className="btn btn-primary" disabled={!name.trim() || !grams || !(grams > 0)} onClick={() => void add()}>
          {t('cook.savePot')}
        </button>
      </div>
    </Sheet>
  );
}
