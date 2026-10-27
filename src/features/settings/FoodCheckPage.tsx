import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { useToast } from '../../app/toast';
import { t, type MessageKey } from '../../i18n';
import { pairedFood } from '../../foods/productMatch';
import { labelValues } from '../../foods/products';
import { addDays } from '../../lib/dates';
import { fmtGrams } from '../../lib/format';
import { checkSignature, foodCheck, type CheckFlag, type CheckRow } from '../../logic/foodCheck';
import { repo } from '../../storage/repo';
import { Segmented } from '../../ui/controls';
import { AskChips } from '../../ui/AskChips';
import { Icon } from '../../ui/Icon';
import { FoodSourceTag } from '../food/FoodSourceTag';
import { makeUp } from '../food/makeUp';
import { pairingName } from '../food/pairingName';
import { SubPage } from './ProfilePage';
import { placeName, useHomeRefs } from '../pantry/usePantry';

type Period = '7' | '28' | 'all';
const PERIODS: Period[] = ['7', '28', 'all'];

/** The food log the assistant gets for each period (Include my data): the shortest that covers it. */
const ASK_PERIOD = { '7': '2w', '28': '4w', all: 'all' } as const;

/** Days to look back for each period; "all" starts at the first entry. */
const periodFrom = (period: Period, today: string, log: ReadonlyArray<{ day: string }>) =>
  period === 'all' ? log.reduce((a, e) => (e.day < a ? e.day : a), today) : addDays(today, -Number(period) + 1);

const FLAG_TEXT: Record<Exclude<CheckFlag, 'kind'>, MessageKey> = { misfit: 'check.misfit', none: 'check.none', auto: 'check.auto' };
const flagText = (f: CheckFlag, r: CheckRow) => t(f === 'kind' ? (`check.kind.${r.kind}` as MessageKey) : FLAG_TEXT[f]);
/**
 * Every food logged in a period with the BLS food its vitamins and minerals come from (owner's ask,
 * 2026-10-27, after a beer was paired with a beer sausage). Flagged ones first: a label that does
 * not fit its food (shown side by side), no food at all, or the app's unchecked pick.
 */
export function FoodCheckPage() {
  const d = useData();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('7');
  const checkedFoods = d.settings.checkedFoods ?? {};
  // What is at home counts in every period: it may be eaten any day (owner's ask, 2026-10-27).
  const home = useHomeRefs();
  const rows = foodCheck(d.log, d.batchesById, d.productsById, d.foods, periodFrom(period, d.today, d.log), d.today, checkedFoods, home);
  const flagged = rows.filter((r) => !r.checked && r.flags.length);
  const fine = rows.filter((r) => !r.checked && !r.flags.length);
  const checked = rows.filter((r) => r.checked);

  /** "Looks right": the mark holds for the food it has now; an app pick becomes the user's own. */
  async function confirm(r: CheckRow) {
    const p = r.product;
    const before = checkedFoods[r.key];
    if (p?.match?.auto) {
      const { auto: _a, ...match } = p.match;
      await repo.setProductMatch(p.id, { match });
    }
    await repo.setFoodChecked(r.key, checkSignature(r.ref, p));
    toast(t('check.marked', { name: r.name }), async () => {
      if (p?.match?.auto) await repo.setProductMatch(p.id, { match: p.match });
      await repo.setFoodChecked(r.key, before);
    });
  }

  async function uncheck(r: CheckRow) {
    const before = checkedFoods[r.key];
    await repo.setFoodChecked(r.key, undefined);
    toast(t('check.unmarked', { name: r.name }), () => repo.setFoodChecked(r.key, before));
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
    const eaten = [
      r.count ? t('check.eaten', { n: r.count, grams: fmtGrams(r.grams) }) : '',
      r.recipes.length ? t('check.inRecipes', { names: r.recipes.join(', ') }) : '',
      r.home ? t('check.atHome', { places: r.home.map(placeName).join(', ') }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <li key={r.key} className="fav-row check-row">
        <a className="result" href={href('food', p ? p.id : r.ref.source === 'BLS' ? r.ref.code : '')}>
          <span className="result-name">{r.name}</span>
          <span className="small">
            <FoodSourceTag foodRef={r.ref} product={p} /> {source(r)}
          </span>
          {!r.checked &&
            r.flags.map((f) => (
              <span key={f} className="small check-flag">
                <Icon name="warning" size={14} /> {flagText(f, r)}
              </span>
            ))}
          {!r.checked && (r.flags.includes('misfit') || r.flags.includes('kind')) && p && food && (
            <span className="muted small check-compare">
              {t('check.label')}: {makeUp(labelValues(p))}
              <br />
              {pairingName(p.match!, d.foods)}: {makeUp(food.per100)}
            </span>
          )}
          {eaten && <span className="muted small">{eaten}</span>}
        </a>
        {r.checked ? (
          <button className="btn btn-small btn-ghost" onClick={() => void uncheck(r)}>
            {t('check.uncheck')}
          </button>
        ) : (
          <button className="btn btn-small btn-secondary" onClick={() => void confirm(r)}>
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
      {rows.length > 0 && (
        <AskChips
          className="check-ask"
          questions={[period === 'all' ? t('check.askTextAll') : t('check.askText', { days: Number(period) })]}
          data={{ kinds: ['food'], period: ASK_PERIOD[period], kitchen: false }}
        />
      )}
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
      {checked.length > 0 && (
        <>
          <h2 className="section-title">{t('check.sectionChecked', { n: checked.length })}</h2>
          <p className="muted small">{t('check.checkedNote')}</p>
          <ul className="result-list card product-check">{checked.map(row)}</ul>
        </>
      )}
    </SubPage>
  );
}
