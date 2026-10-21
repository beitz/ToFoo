import { Fragment } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { NUTRIENTS } from '../../model/nutrients';
import { Icon } from '../../ui/Icon';
import { hasOwnMicros, isProductCode, productFood } from '../../foods/products';
import { partSource } from '../../logic/mealNutrients';
import { ProductInfo } from '../log/ProductParts';
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
  const match = product?.match ? d.foods.byCode.get(product.match.code) : undefined;
  return (
    <section>
      <header className="page-head row">
        <BackButton />
        <h1 className="grow">{food.nameEn}</h1>
      </header>
      {product ? (
        <>
          <ProductInfo product={product} />
          <p className="muted small">
            {match ? (
              <>
                {t(hasOwnMicros(product) ? 'source.gapsFrom' : 'source.restFrom')} <a href={href('food', match.code)}>{match.nameEn}</a> <span className="muted">(BLS {match.code})</span>
              </>
            ) : (
              t(hasOwnMicros(product) ? 'source.noMatchGeneric' : 'source.noMatch')
            )}
          </p>
        </>
      ) : (
        <p className="muted">
          {food.nameDe} · {group?.en} · BLS {food.code}
        </p>
      )}
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
