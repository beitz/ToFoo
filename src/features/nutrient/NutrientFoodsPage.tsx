import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { portionGrams } from '../../model/ranking';
import { NON_SINGLE_FOOD_GROUPS } from '../../foods/foodDb';
import { diverseTop } from '../../foods/variety';
import { Segmented, Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { BackButton } from '../../ui/BackButton';

const PAGE = 50;

/** Every food ranked by one nutrient, with filters. Route: #/nutrient/<id>/foods. */
export function NutrientFoodsPage({ id }: { id: string }) {
  const d = useData();
  const def = NUTRIENT_BY_ID.get(id);
  const recommended = d.requirements.byNutrient.get(id)?.recommended;
  const [basis, setBasis] = useState<'portion' | 'per100'>('portion');
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [varied, setVaried] = useState(false);
  const [dishes, setDishes] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const groups = useMemo(() => Object.entries(d.foods.groups).sort((a, b) => a[1].en.localeCompare(b[1].en)), [d.foods.groups]);

  const ranked = useMemo(() => {
    const excludedGroups = new Set(d.profile.exclusions.groups);
    const excludedFoods = new Set(d.profile.exclusions.foods);
    const q = query.trim().toLowerCase();
    const rows = d.foods.foods
      .filter(
        (f) =>
          typeof f.per100[id] === 'number' &&
          (f.per100[id] as number) > 0 &&
          !excludedGroups.has(f.group) &&
          !excludedFoods.has(f.code) &&
          (dishes || !NON_SINGLE_FOOD_GROUPS.has(f.group)) &&
          (!group || f.group === group) &&
          (!q || f.nameEn.toLowerCase().includes(q) || f.nameDe.toLowerCase().includes(q)),
      )
      .map((f) => {
        const grams = basis === 'portion' ? portionGrams(f.per100) : 100;
        return { f, grams, amount: ((f.per100[id] as number) * grams) / 100 };
      })
      .sort((a, b) => b.amount - a.amount);
    return varied ? diverseTop(rows, rows.length, (r) => r.f) : rows;
  }, [d.foods, d.profile.exclusions, id, basis, group, query, varied, dishes]);

  if (!def) return <p>{t('nutrient.unknown')}</p>;

  return (
    <section>
      <header className="page-head row">
        <BackButton to={['nutrient', id]} />
        <h1 className="grow">{t('foods.title', { nutrient: def.name })}</h1>
      </header>

      <Segmented
        label={t('foods.basis')}
        value={basis}
        onChange={(v) => {
          setBasis(v);
          setShown(PAGE);
        }}
        options={[
          { value: 'portion', label: t('nutrient.perPortion') },
          { value: 'per100', label: t('nutrient.per100') },
        ]}
      />
      <div className="search-box">
        <Icon name="search" />
        <input
          type="search"
          placeholder={t('foods.filter')}
          aria-label={t('foods.filter')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
      </div>
      <select
        aria-label={t('foods.group')}
        value={group}
        onChange={(e) => {
          setGroup(e.target.value);
          setShown(PAGE);
        }}
      >
        <option value="">{t('foods.allGroups')}</option>
        {groups.map(([code, g]) => (
          <option key={code} value={code}>
            {g.en}
          </option>
        ))}
      </select>
      <Toggle checked={varied} onChange={setVaried} label={t('foods.varied')} description={t('foods.variedHint')} />
      <Toggle checked={dishes} onChange={setDishes} label={t('foods.dishes')} />

      <p className="muted small">
        {t('foods.count', { n: ranked.length })} {basis === 'portion' ? t('foods.portionHint') : ''} {recommended ? t('foods.pctHint') : ''}
      </p>
      <ol className="food-rank">
        {ranked.slice(0, shown).map(({ f, grams, amount }) => (
          <li key={f.code}>
            <a className="food-rank-row" href={href('food', f.code)}>
              <span className="grow">
                <span className="food-rank-name">{f.nameEn}</span>
                <span className="muted small block">{f.nameDe}</span>
              </span>
              <span className="food-rank-amount">
                <strong>{fmtAmount(id, amount)}</strong>
                <span className="muted small block">
                  {basis === 'portion' ? `${Math.round(grams)} g` : '100 g'}
                  {recommended ? ` · ${fmtPercent(amount / recommended)}` : ''}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
      {shown < ranked.length && (
        <button className="btn btn-secondary btn-block" onClick={() => setShown(shown + PAGE)}>
          {t('foods.more', { n: Math.min(PAGE, ranked.length - shown) })}
        </button>
      )}
    </section>
  );
}
