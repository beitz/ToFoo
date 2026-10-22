import { useMemo, useState, type CSSProperties } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { fmtGrams } from '../../lib/format';
import { COLUMN_GROUPS, columnsOf, whoGivesWhat, type ColumnGroup } from '../../logic/recipePage';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { Recipe } from '../../storage/types';
import { StatusMark, symbolOf } from '../../ui/Tile';
import { recipePieces } from '../nutrient/NutrientSplit';
import { useGaps } from './useGaps';

/** Below half a percent of the pot, a cell stays empty: rounding, not a source. */
const SHOWN_SHARE = 0.005;

/**
 * "Who gives what" (design 2026-10-22): each ingredient's share of the whole pot for each nutrient,
 * darker = more. Opens on "Your gaps" with group chips above (owner's decision); the ingredient
 * column stays put while the numbers scroll sideways. A row opens the ingredient (change, remove,
 * swap), a column the nutrient split by ingredient.
 */
export function WhoGivesWhat({ recipe, was, onIngredient }: { recipe: Recipe; was: ReadonlyMap<number, string>; onIngredient: (index: number) => void }) {
  const d = useData();
  const gaps = useGaps();
  const [group, setGroup] = useState<ColumnGroup>('gaps');
  const pieces = useMemo(() => recipePieces(d, recipe, false), [recipe, d.foods, d.productsById, d.profile.salt]);
  const isLimit = (id: string) => d.model.nutrients.get(id)?.kind === 'limit' || !!d.requirements.byNutrient.get(id)?.limitOnly;
  const ids = columnsOf(group, (id) => gaps.has(id), isLimit);
  const cells = whoGivesWhat(pieces, ids);
  if (pieces.length === 0) return null;
  return (
    <div className="card give">
      <div className="card-head">
        <h2>{t('give.title')}</h2>
        <span className="card-note">{t('give.note')}</span>
      </div>
      <div className="give-groups" role="group" aria-label={t('give.groupsLabel')}>
        {COLUMN_GROUPS.map((g) => (
          <button key={g} type="button" className={`give-group${g === group ? ' on' : ''}`} aria-pressed={g === group} onClick={() => setGroup(g)}>
            {t(`give.group.${g}` as MessageKey)}
          </button>
        ))}
      </div>
      {group === 'gaps' && ids.length <= 2 && <p className="muted small">{t('give.noGaps')}</p>}
      {ids.length === 0 ? (
        <p className="muted small">{t('give.noneInGroup')}</p>
      ) : (
        <div className="give-scroll">
          <table className="give-table">
            <caption className="visually-hidden">{t('give.caption', { name: recipe.name })}</caption>
            <thead>
              <tr>
                <th scope="col" className="give-corner">
                  <span className="visually-hidden">{t('give.ingredient')}</span>
                </th>
                {ids.map((id) => {
                  const gap = gaps.get(id);
                  return (
                    <th key={id} scope="col">
                      <a className="give-head" href={href('nutrient', id, 'recipe', recipe.id)} aria-label={NUTRIENT_BY_ID.get(id)?.name ?? id}>
                        {symbolOf(id)}
                        {gap && <StatusMark status={gap} size={8} />}
                      </a>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pieces.map((p, i) => (
                <tr key={p.key}>
                  <th scope="row" className="give-ing">
                    <button type="button" onClick={() => onIngredient(i)}>
                      <span className="give-name">{p.label}</span>
                      <span className="muted small">
                        {fmtGrams(recipe.ingredients[i]?.grams ?? 0)}
                        {was.has(i) ? ` · ${t('give.was', { name: was.get(i)! })}` : ''}
                      </span>
                    </button>
                  </th>
                  {cells[i]!.map((c, j) => {
                    const share = c.share !== undefined && c.share >= SHOWN_SHARE ? c.share : undefined;
                    return (
                      <td key={ids[j]}>
                        <span
                          className={`give-cell${share !== undefined && share >= 0.45 ? ' give-hot' : ''}${c.missing ? ' give-unknown' : ''}`}
                          style={share !== undefined ? ({ '--heat': share } as CSSProperties) : undefined}
                        >
                          {share !== undefined ? Math.round(share * 100) : c.missing ? '?' : ''}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">{t('give.hint')}</p>
    </div>
  );
}
