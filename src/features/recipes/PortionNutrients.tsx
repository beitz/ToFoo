import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { portionIntake } from '../../logic/recipeIdeas';
import { NUTRIENTS, NUTRIENT_BY_ID } from '../../model/nutrients';
import { href } from '../../app/router';
import { Sheet } from '../../ui/controls';
import { recipePieces, SplitList } from '../nutrient/NutrientSplit';
import type { Storage } from '../../model/paramTypes';
import type { Recipe } from '../../storage/types';

/**
 * Nutrients in one portion (after cooking losses), as % of the daily reference intake. Each nutrient
 * opens which ingredient gives how much of it: a saved recipe's on the nutrient page, a recipe being
 * edited (not saved yet, so not leaving the editor) in a sheet.
 */
export function PortionNutrients({ recipe, storage = 'fresh', saved = false, bare = false }: { recipe: Recipe; storage?: Storage; saved?: boolean; bare?: boolean }) {
  const d = useData();
  const [all, setAll] = useState(false);
  const [split, setSplit] = useState<string | null>(null);
  const rows = useMemo(() => {
    const ctx = { foods: d.foods, products: d.productsById, batches: new Map(), customFoods: new Map(), salt: recipe.saltOverride ?? d.profile.salt };
    const res = portionIntake(recipe, ctx, storage);
    return NUTRIENTS.map((n) => {
      const amount = res.intake[n.id] ?? 0;
      const req = d.requirements.byNutrient.get(n.id);
      const pct = req && !req.limitOnly && req.recommended > 0 ? amount / req.recommended : undefined;
      return { id: n.id, name: n.name, amount, pct, missing: res.missing.includes(n.id) };
    });
  }, [recipe, storage, d.foods, d.productsById, d.profile.salt, d.requirements]);
  const sorted = [...rows].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const shown = all ? rows : sorted.filter((r) => r.pct !== undefined).slice(0, 10);
  const energy = rows.find((r) => r.id === 'ENERCC');
  return (
    <div className={bare ? 'portion-all' : 'card'}>
      {energy && <p className="small">{t('recipes.energyPerPortion', { kcal: fmtAmount('ENERCC', energy.amount) })}</p>}
      <table className="nutrient-table">
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td>
                {saved ? (
                  <a className="row-link" href={href('nutrient', r.id, 'recipe', recipe.id)}>
                    {r.name}
                  </a>
                ) : (
                  <button className="row-link" onClick={() => setSplit(r.id)}>
                    {r.name}
                  </button>
                )}
              </td>
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
      {split && (
        <Sheet title={t('split.inRecipe', { name: recipe.name || t('recipes.new') })} onClose={() => setSplit(null)}>
          <h3 className="section-title">{NUTRIENT_BY_ID.get(split)?.name ?? split}</h3>
          <SplitList nutrient={split} pieces={recipePieces(d, recipe, false)} />
          <p className="muted small">{t('split.sheetHint')}</p>
        </Sheet>
      )}
    </div>
  );
}
