import { useMemo } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { portionIntake } from '../../logic/recipeIdeas';
import { NUTRIENTS, NUTRIENT_BY_ID } from '../../model/nutrients';
import type { Recipe } from '../../storage/types';
import { StatusMark, symbolOf } from '../../ui/Tile';
import { useGaps } from './useGaps';

const MACROS = ['ENERCC', 'PROT625', 'FAT', 'CHO'] as const;
/** A nutrient that is not a gap gets a chip from this share of a day's need, as on the food page. */
const MIN_SHARE = 0.1;
const MAX_CHIPS = 12;

/**
 * "One portion gives" (design 2026-10-22): energy and the macros as amounts, then each gap and
 * everything else one portion gives a tenth of a day of, as % of a day's recommended intake.
 * Each chip opens the nutrient split by ingredient. Eaten fresh, after cooking losses.
 */
export function PortionGives({ recipe }: { recipe: Recipe }) {
  const d = useData();
  const gaps = useGaps();
  const res = useMemo(
    () => portionIntake(recipe, { foods: d.foods, products: d.productsById, batches: new Map(), customFoods: d.customFoodsById, salt: recipe.saltOverride ?? d.profile.salt }),
    [recipe, d.foods, d.productsById, d.customFoodsById, d.profile.salt],
  );
  const chips = NUTRIENTS.flatMap((n) => {
    const req = d.requirements.byNutrient.get(n.id);
    if (!req || req.limitOnly || !(req.recommended > 0) || n.id === 'ENERCC' || n.path.includes('eaa')) return [];
    const share = (res.intake[n.id] ?? 0) / req.recommended;
    const gap = gaps.get(n.id);
    return gap || share >= MIN_SHARE ? [{ id: n.id, share, gap, missing: res.missing.includes(n.id) }] : [];
  })
    .sort((a, b) => (a.gap ? 0 : 1) - (b.gap ? 0 : 1) || b.share - a.share)
    .slice(0, MAX_CHIPS);
  return (
    <div className="card gives">
      <div className="card-head">
        <h2>{t('gives.title')}</h2>
        <span className="card-note">{t('gives.note')}</span>
      </div>
      <div className="gives-macros">
        {MACROS.map((id) => (
          <a key={id} className="gives-macro" href={href('nutrient', id, 'recipe', recipe.id)}>
            <span className="muted small">{id === 'ENERCC' ? 'kcal' : NUTRIENT_BY_ID.get(id)?.short}</span>
            <strong>
              {id === 'ENERCC' ? fmtAmount(id, res.intake[id] ?? 0).replace(/\s*kcal$/, '') : fmtAmount(id, res.intake[id] ?? 0)}
              {res.missing.includes(id) ? '+' : ''}
            </strong>
          </a>
        ))}
      </div>
      <div className="next-chips gives-chips">
        {chips.map((c) => {
          const name = NUTRIENT_BY_ID.get(c.id)?.name ?? c.id;
          const pct = fmtPercent(c.share);
          return (
            <a
              key={c.id}
              className={`next-chip${c.gap ? ' chip-gap' : ''}`}
              href={href('nutrient', c.id, 'recipe', recipe.id)}
              aria-label={t(c.gap ? 'gives.chipGap' : 'gives.chip', { name, pct }) + (c.missing ? ` ${t('gives.missingSpoken')}` : '')}
            >
              {c.gap && <StatusMark status={c.gap} size={10} />}
              <strong aria-hidden>{symbolOf(c.id)}</strong>
              <span aria-hidden>
                {pct.replace(/\s/g, '')}
                {c.missing ? '+' : ''}
              </span>
            </a>
          );
        })}
      </div>
      {chips.some((c) => c.missing) && <p className="muted small">{t('gives.missingNote')}</p>}
    </div>
  );
}
