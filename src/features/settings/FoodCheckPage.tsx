import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { useToast } from '../../app/toast';
import { t, type MessageKey } from '../../i18n';
import type { RawValue } from '../../model/types';
import { pairedFood } from '../../foods/productMatch';
import { labelValues, productLabel } from '../../foods/products';
import { addDays } from '../../lib/dates';
import { fmtGrams, fmtNumber } from '../../lib/format';
import { foodCheck, type CheckFlag, type CheckRow } from '../../logic/foodCheck';
import { repo } from '../../storage/repo';
import type { Product } from '../../storage/types';
import { Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { FoodSourceTag } from '../food/FoodSourceTag';
import { pairingName } from '../food/pairingName';
import { SubPage } from './ProfilePage';

type Period = '7' | '28' | 'all';
const PERIODS: Period[] = ['7', '28', 'all'];

/** Days to look back for each period; "all" starts at the first entry. */
const periodFrom = (period: Period, today: string, log: ReadonlyArray<{ day: string }>) =>
  period === 'all' ? log.reduce((a, e) => (e.day < a ? e.day : a), today) : addDays(today, -Number(period) + 1);

const FLAG_TEXT: Record<CheckFlag, MessageKey> = { misfit: 'check.misfit', none: 'check.none', auto: 'check.auto' };
const MACROS = [
  ['FAT', 'check.fat'],
  ['PROT625', 'check.protein'],
  ['CHO', 'check.carbs'],
] as const;

/** "42 kcal · fat – · protein 0.5 g · carbs 3 g": what is compared, per 100 g. */
function makeUp(per100: Readonly<Record<string, RawValue>>): string {
  const g = (v: RawValue | undefined) => (typeof v === 'number' ? fmtGrams(v) : v === 't' ? '0 g' : '–');
  const kcal = per100.ENERCC;
  return [typeof kcal === 'number' ? `${fmtNumber(kcal)} kcal` : '– kcal', ...MACROS.map(([id, key]) => `${t(key)} ${g(per100[id])}`)].join(' · ');
}

/**
 * Every food logged in a period with the BLS food its vitamins and minerals come from (owner's ask,
 * 2026-10-27, after a beer was paired with a beer sausage). Flagged ones first: a label that does
 * not fit its food (shown side by side), no food at all, or the app's unchecked pick.
 */
export function FoodCheckPage() {
  const d = useData();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('7');
  const rows = foodCheck(d.log, d.batchesById, d.productsById, d.foods, periodFrom(period, d.today, d.log), d.today);
  const flagged = rows.filter((r) => r.flags.length);
  const fine = rows.filter((r) => !r.flags.length);

  async function confirm(p: Product) {
    if (!p.match) return;
    const { auto: _a, ...match } = p.match;
    await repo.setProductMatch(p.id, { match });
    toast(t('match.saved', { name: productLabel(p), food: pairingName(p.match, d.foods) }), () => repo.setProductMatch(p.id, { match: p.match }));
  }

  const source = (r: CheckRow) => {
    const p = r.product;
    if (!p) return r.ref.source === 'BLS' ? r.ref.code : '';
    if (p.match) return t('check.from', { food: pairingName(p.match, d.foods) });
    return p.labelOnly ? t('match.labelOnly') : '';
  };

  const row = (r: CheckRow) => {
    const p = r.product;
    const food = p?.match && pairedFood(p.match, d.foods);
    const eaten = [r.count ? t('check.eaten', { n: r.count, grams: fmtGrams(r.grams) }) : '', r.recipes.length ? t('check.inRecipes', { names: r.recipes.join(', ') }) : ''].filter(Boolean).join(' · ');
    return (
      <li key={r.key} className="fav-row check-row">
        <a className="result" href={href('food', p ? p.id : r.ref.source === 'BLS' ? r.ref.code : '')}>
          <span className="result-name">{r.name}</span>
          <span className="small">
            <FoodSourceTag foodRef={r.ref} product={p} /> {source(r)}
          </span>
          {r.flags.map((f) => (
            <span key={f} className="small check-flag">
              <Icon name="warning" size={14} /> {t(FLAG_TEXT[f])}
            </span>
          ))}
          {r.flags.includes('misfit') && p && food && (
            <span className="muted small check-compare">
              {t('check.label')}: {makeUp(labelValues(p))}
              <br />
              {pairingName(p.match!, d.foods)}: {makeUp(food.per100)}
            </span>
          )}
          {eaten && <span className="muted small">{eaten}</span>}
        </a>
        {p?.match?.auto && (
          <button className="btn btn-small btn-secondary" onClick={() => void confirm(p)}>
            {t('match.confirm')}
          </button>
        )}
      </li>
    );
  };

  return (
    <SubPage title={t('check.title')}>
      <p className="muted small">{t('check.intro')}</p>
      <Segmented label={t('check.period')} value={period} onChange={setPeriod} options={PERIODS.map((value) => ({ value, label: t(`check.period.${value}` as MessageKey) }))} />
      {!rows.length && <p className="muted">{t('check.empty')}</p>}
      {flagged.length > 0 && (
        <>
          <h2 className="section-title">{t('check.sectionLook', { n: flagged.length })}</h2>
          <ul className="result-list card product-check">{flagged.map(row)}</ul>
        </>
      )}
      {fine.length > 0 && (
        <>
          <h2 className="section-title">{t('check.sectionFine', { n: fine.length })}</h2>
          <ul className="result-list card product-check">{fine.map(row)}</ul>
        </>
      )}
    </SubPage>
  );
}
