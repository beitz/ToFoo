import { useMemo } from 'react';
import { useData, type AppData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { formatDay, formatTime } from '../../lib/dates';
import { fmtAmount, fmtGrams, fmtPercent } from '../../lib/format';
import { breakdown } from '../../logic/mealNutrients';
import { ingredientPieces, splitNutrient, type SplitPiece } from '../../logic/nutrientSplit';
import type { ModelEntry } from '../../model/types';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { isOn } from '../../settings/features';
import type { Recipe } from '../../storage/types';
import { entryAmount } from '../log/describe';
import { mealOf } from '../meal/MealNutrientsPage';

/** One part of the whole as the list shows it: name, its amount (grams…) and where tapping it goes. */
export interface ShownPiece extends SplitPiece {
  key: string;
  label: string;
  sub?: string;
  to?: string;
}

/** What the nutrient page was opened from: a recipe, a meal or one entry of a meal (route parts after the nutrient). */
export type SplitContext = { kind: 'recipe' | 'meal' | 'entry'; id: string };

export function splitContext(kind: string | undefined, id: string | undefined): SplitContext | undefined {
  return id && (kind === 'recipe' || kind === 'meal' || kind === 'entry') ? { kind, id } : undefined;
}

/** Each ingredient's part of one portion, linked to its food page where it has one. */
export function recipePieces(d: AppData, recipe: Pick<Recipe, 'name' | 'portions' | 'ingredients' | 'saltOverride'>, link: boolean): ShownPiece[] {
  const ctx = { foods: d.foods, products: d.productsById, batches: new Map(), customFoods: new Map(), salt: recipe.saltOverride ?? d.profile.salt };
  return ingredientPieces(recipe, ctx).map((p) => ({
    ...p,
    key: String(p.index),
    label: p.ingredient.isSalt ? t('recipes.salt') : p.label,
    sub: fmtGrams(p.ingredient.grams / recipe.portions),
    to: link && p.code && d.foods.byCode.has(p.code) ? href('food', p.code) : undefined,
  }));
}

/** The parts of a meal (its items) or of one entry (its ingredients), as the meal page counts them. */
function logPieces(d: AppData, ctx: SplitContext, nutrient: string): { title: string; pieces: ShownPiece[] } | undefined {
  const entry = d.log.find((e) => e.id === ctx.id);
  if (!entry) return undefined;
  const entries = new Map<string, ModelEntry>(d.modelEntries.map((e) => [e.id, e]));
  const opts = { retention: isOn(d.settings.features, 'retention') };
  const of = (entryId: string, part?: number) => {
    const b = breakdown([{ entryId, part }], entries, d.model.meals, opts);
    return { intake: b.intake, missing: [...b.missing] };
  };
  const when = `${formatDay(entry.day, d.today)} ${formatTime(entry.time)}`;
  if (ctx.kind === 'meal') {
    const meal = mealOf(d, entry);
    return {
      title: t('split.inMeal', { when: `${formatDay(meal[0]!.day, d.today)} ${formatTime(meal[0]!.time)}` }),
      pieces: meal.map((e) => ({
        ...of(e.id),
        key: e.id,
        label: e.label,
        sub: entryAmount(e, d),
        // An item made of several foods opens its own split; a single food its page.
        to: (entries.get(e.id)?.parts.length ?? 0) > 1 ? href('nutrient', nutrient, 'entry', e.id) : href('entry', e.id),
      })),
    };
  }
  const parts = entries.get(entry.id)?.parts ?? [];
  return {
    title: t('split.inEntry', { name: entry.label, when }),
    pieces: parts.map((p, i) => ({ ...of(entry.id, i), key: String(i), label: p.label, sub: fmtGrams(p.grams), to: href('entry', entry.id, String(i)) })),
  };
}

/** The nutrient page's first card when opened from a recipe or a meal: which part gave how much of it. */
export function SplitCard({ nutrient, context }: { nutrient: string; context: SplitContext }) {
  const d = useData();
  const shown = useMemo(() => {
    if (context.kind === 'recipe') {
      const recipe = d.recipes.find((r) => r.id === context.id);
      return recipe ? { title: t('split.inRecipe', { name: recipe.name }), pieces: recipePieces(d, recipe, true), hint: t('split.recipeHint') } : undefined;
    }
    const log = logPieces(d, context, nutrient);
    return log && { ...log, hint: t('split.mealHint') };
  }, [d, context.kind, context.id, nutrient]);
  if (!shown) return null;
  return (
    <>
      <h2 className="section-title">{shown.title}</h2>
      <div className="card">
        <SplitList nutrient={nutrient} pieces={shown.pieces} />
        <p className="muted small">{shown.hint}</p>
      </div>
    </>
  );
}

/** Each part's amount of one nutrient and its share of the whole, biggest first; then what has none or no data. */
export function SplitList({ nutrient, pieces }: { nutrient: string; pieces: readonly ShownPiece[] }) {
  const s = splitNutrient(pieces, nutrient);
  const name = NUTRIENT_BY_ID.get(nutrient)?.name ?? nutrient;
  const partial = s.noData.length > 0 || s.rows.some((r) => r.partial);
  return (
    <>
      <p className="split-total">
        <strong>
          {partial && s.total > 0 ? '≥ ' : ''}
          {s.total > 0 || !partial ? fmtAmount(nutrient, s.total) : '–'}
        </strong>{' '}
        <span className="muted small">{t('split.total', { name })}</span>
      </p>
      {s.rows.length > 0 && (
        <ul className="split-list">
          {s.rows.map((r) => {
            const amount = `${r.partial ? '≥ ' : ''}${fmtAmount(nutrient, r.amount)}`;
            const body = (
              <>
                <span className="split-name">
                  <span className="split-label">{r.piece.label}</span>
                  {r.piece.sub && <span className="muted small"> {r.piece.sub}</span>}
                </span>
                <span className="split-amount muted">{amount}</span>
                <span className="split-share">{fmtPercent(r.share)}</span>
                <span className="nrow-bar split-bar" aria-hidden>
                  <span className="nrow-fill" style={{ width: `${Math.min(1, r.share) * 100}%` }} />
                </span>
              </>
            );
            const spoken = t('split.rowLabel', { name: r.piece.label, amount, pct: fmtPercent(r.share) });
            return (
              <li key={r.piece.key}>
                {r.piece.to ? (
                  <a className="split-row" href={r.piece.to} aria-label={spoken}>
                    {body}
                  </a>
                ) : (
                  <div className="split-row" aria-label={spoken}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {s.none.length > 0 && <p className="small muted">{t('split.none', { list: s.none.map((p) => p.label).join(', ') })}</p>}
      {s.noData.length > 0 && <p className="small notice">{t('split.noData', { list: s.noData.map((p) => p.label).join(', ') })}</p>}
    </>
  );
}
