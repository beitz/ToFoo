import { Fragment } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { fmtAmount, fmtNumber, fmtPercent } from '../../lib/format';
import { portionGrams, RANK_PORTION } from '../../model/ranking';
import type { RawValue } from '../../model/types';
import { StatusMark, symbolOf } from '../../ui/Tile';
import { NUTRIENTS } from '../../model/nutrients';
import { Icon } from '../../ui/Icon';
import { isProductCode, productFood } from '../../foods/products';
import { partSource } from '../../logic/mealNutrients';
import { ProductInfo, SavedMatchPicker } from '../log/ProductParts';
import { PieceWeightLine } from '../log/AmountField';
import { nutrientType } from '../home/grouping';
import { GroupInfoButton, groupTitle, hasGroupInfo } from '../info/GroupInfo';
import { BackButton } from '../../ui/BackButton';

/**
 * A food's nutrient profile per 100 g: a BLS food, or a scanned or USDA product (`OFF:<barcode>`,
 * `USDA:<id>`) with its label values and the similar BLS food's for the rest, each marked by source.
 */
export function FoodPage({ code }: { code: string }) {
  const d = useData();
  const product = isProductCode(code) ? d.productsById.get(code) : undefined;
  const food = product ? productFood(product, d.foods) : d.foods.byCode.get(code);
  if (!food) return <p>{t('food.notFound')}</p>;
  const group = d.foods.groups[food.group];
  return (
    <section>
      <header className="page-head row">
        <BackButton />
        <h1 className="grow">{food.nameEn}</h1>
      </header>
      {product ? (
        <>
          <ProductInfo product={product} />
          <SavedMatchPicker product={product} />
        </>
      ) : (
        <p className="muted">
          {food.nameDe} · {group?.en} · BLS {food.code}
        </p>
      )}
      <PieceWeightLine code={food.code} product={product} />
      <PortionCard per100={food.per100} />
      <a className="btn btn-primary btn-block" href={href('log', d.today, food.code)}>
        <Icon name="plus" /> {t('food.log')}
      </a>
      <h2 className="section-title">{t('food.per100')}</h2>
      <table className="nutrient-table card">
        <tbody>
          {NUTRIENTS.map((n, i) => {
            const v = food.per100[n.id];
            const req = d.requirements.byNutrient.get(n.id);
            const pct = typeof v === 'number' && req && !req.limitOnly && req.recommended > 0 ? v / req.recommended : undefined;
            const group = nutrientType(n.id);
            const startsGroup = hasGroupInfo(group) && (i === 0 || nutrientType(NUTRIENTS[i - 1]!.id) !== group);
            return (
              <Fragment key={n.id}>
                {startsGroup && (
                  <tr className="group-row">
                    <th colSpan={4} scope="rowgroup">
                      <div className="group-row-head">
                        <span>{groupTitle(group)}</span>
                        <GroupInfoButton group={group} />
                      </div>
                    </th>
                  </tr>
                )}
                <tr>
                  <td>
                    <a href={href('nutrient', n.id)}>{n.name}</a>
                  </td>
                  <td className="num">{v === null || v === undefined ? <span className="muted">{t('food.noData')}</span> : v === 't' ? t('food.trace') : fmtAmount(n.id, v)}</td>
                  <td className="num muted">{pct !== undefined ? fmtPercent(pct) : ''}</td>
                  {product ? (
                    <td className="muted small">{partSource(food, n.id) ?? ''}</td>
                  ) : (
                    <td className="muted small" title={d.foods.provenanceCodes[food.provenance[n.id] ?? '-'] ?? ''}>
                      {food.provenance[n.id] !== '-' ? food.provenance[n.id] : ''}
                    </td>
                  )}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">{t(product ? 'food.legendProduct' : 'food.legend')}</p>
    </section>
  );
}

/** Shares below this are left out of "One portion gives": a tenth of a day is where a food starts to count. */
const PORTION_MIN_SHARE = 0.1;
const PORTION_MAX_CHIPS = 12;

/**
 * "One portion gives" (design 2026-10-22): a typical portion's share of a day for the nutrients it
 * gives a lot of, biggest first, with your own gaps marked, each tapping through to its nutrient.
 */
function PortionCard({ per100 }: { per100: Readonly<Record<string, RawValue>> }) {
  const d = useData();
  const grams = portionGrams(per100);
  const shares = NUTRIENTS.flatMap((n) => {
    const v = per100[n.id];
    const req = d.requirements.byNutrient.get(n.id);
    // Amino acids follow protein; listing nine of them would bury the rest.
    if (typeof v !== 'number' || !req || req.limitOnly || !(req.recommended > 0) || n.id === 'ENERCC' || n.path.includes('eaa')) return [];
    const share = (v * grams) / 100 / req.recommended;
    return share >= PORTION_MIN_SHARE ? [{ id: n.id, name: n.name, share }] : [];
  })
    .sort((a, b) => b.share - a.share)
    .slice(0, PORTION_MAX_CHIPS);
  const kcal = typeof per100.ENERCC === 'number' ? (per100.ENERCC * grams) / 100 : undefined;
  return (
    <div className="card portion-card">
      <div className="card-head">
        <h2>{t('food.portionTitle', { g: Math.round(grams) })}</h2>
        {kcal !== undefined && <span className="card-note">{t('food.portionKcal', { kcal: fmtNumber(kcal) })}</span>}
      </div>
      {shares.length === 0 ? (
        <p className="muted small">{t('food.portionNone')}</p>
      ) : (
        <div className="next-chips portion-chips">
          {shares.map((x) => {
            const status = d.model.nutrients.get(x.id)?.store?.status ?? d.model.nutrients.get(x.id)?.status;
            const gap = status === 'low' || status === 'gettingLow';
            return (
              <a
                key={x.id}
                className={`next-chip${gap ? ' chip-gap' : ''}`}
                href={href('nutrient', x.id)}
                aria-label={t(gap ? 'food.portionChipGap' : 'food.portionChip', { name: x.name, pct: fmtPercent(x.share) })}
              >
                {gap && status && <StatusMark status={status} size={10} />}
                <strong aria-hidden>{symbolOf(x.id)}</strong>
                <span aria-hidden>{fmtPercent(x.share).replace(/\s/g, '')}</span>
              </a>
            );
          })}
        </div>
      )}
      <p className="muted small">
        {t('food.portionNote', {
          kcal: RANK_PORTION.kcal,
          min: RANK_PORTION.minGrams,
          max: RANK_PORTION.maxGrams,
        })}
      </p>
    </div>
  );
}
