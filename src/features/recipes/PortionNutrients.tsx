import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { batchParts } from '../../logic/resolve';
import { entryIntake } from '../../model/intake';
import { NUTRIENTS } from '../../model/nutrients';
import type { Storage } from '../../model/paramTypes';
import type { Batch, Recipe } from '../../storage/types';

/** Nutrients in one portion (after cooking losses), as % of the daily reference intake. */
export function PortionNutrients({ recipe, storage = 'fresh' }: { recipe: Recipe; storage?: Storage }) {
  const d = useData();
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const batch: Batch = {
      id: 'preview',
      schemaVersion: 1,
      recipeId: recipe.id,
      recipe: { name: recipe.name, portions: recipe.portions, ingredients: recipe.ingredients, saltOverride: recipe.saltOverride },
      cookedDay: d.today,
      cookedAt: 0,
      plan: { fresh: 1, fridge: 0, freezer: 0 },
      remaining: { fresh: 1, fridge: 0, freezer: 0 },
      corrections: [],
    };
    const ctx = { foods: d.foods, products: d.productsByCode, batches: new Map(), customFoods: new Map(), salt: recipe.saltOverride ?? d.profile.salt };
    const parts = batchParts(batch, 1, storage, ctx);
    const res = entryIntake({ id: 'p', label: recipe.name, time: 0, dayKey: d.today, confidence: 'A', isSupplement: false, parts }, 'central', { retention: true });
    return NUTRIENTS.map((n) => {
      const amount = res.intake[n.id] ?? 0;
      const req = d.requirements.byNutrient.get(n.id);
      const pct = req && !req.limitOnly && req.recommended > 0 ? amount / req.recommended : undefined;
      return { id: n.id, name: n.name, amount, pct, missing: res.missing.includes(n.id) };
    });
  }, [recipe, storage, d.foods, d.productsByCode, d.profile.salt, d.requirements, d.today]);
  const sorted = [...rows].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const shown = all ? rows : sorted.filter((r) => r.pct !== undefined).slice(0, 10);
  const energy = rows.find((r) => r.id === 'ENERCC');
  return (
    <div className="card">
      {energy && <p className="small">{t('recipes.energyPerPortion', { kcal: fmtAmount('ENERCC', energy.amount) })}</p>}
      <table className="nutrient-table">
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className="num">{fmtAmount(r.id, r.amount)}</td>
              <td className="num muted">{r.pct !== undefined ? fmtPercent(r.pct) : ''}</td>
              <td>{r.missing ? <span className="muted small" title={t('food.someMissing')}>*</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{t('recipes.pctHint')}</p>
      <button className="btn btn-small btn-ghost" onClick={() => setAll(!all)}>
        {all ? t('recipes.showTop') : t('recipes.showAll')}
      </button>
    </div>
  );
}
