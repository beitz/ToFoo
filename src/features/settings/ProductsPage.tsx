import { useData } from '../../app/data';
import { href } from '../../app/router';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { hasOwnMicros, needsCheck, productLabel } from '../../foods/products';
import { productTag } from '../log/ProductList';
import { refKey } from '../../lib/refs';
import { repo } from '../../storage/repo';
import type { Product } from '../../storage/types';
import { SubPage } from './ProfilePage';

/**
 * Saved products and where their vitamins and minerals come from. The app's own picks and products
 * with no similar food come first, to check once; tapping one opens its page, where it can be changed.
 */
export function ProductsPage() {
  const d = useData();
  const toast = useToast();
  const logged = new Map<string, number>();
  for (const e of d.log) if (e.kind === 'food' && (e.ref.source === 'OFF' || e.ref.source === 'USDA')) logged.set(refKey(e.ref), (logged.get(refKey(e.ref)) ?? 0) + 1);
  const toCheck = d.products.filter(needsCheck);
  const checked = d.products.filter((p) => !needsCheck(p));

  async function confirm(p: Product) {
    if (!p.match) return;
    const { auto: _a, ...match } = p.match;
    await repo.setProductMatch(p.id, { match });
    toast(t('match.saved', { name: productLabel(p), food: d.foods.byCode.get(p.match.code)?.nameEn ?? p.match.code }), () => repo.setProductMatch(p.id, { match: p.match }));
  }

  function status(p: Product): string {
    const food = p.match ? d.foods.byCode.get(p.match.code) : undefined;
    if (food) return p.match?.auto ? `${food.nameEn} · ${t('match.autoShort')}` : food.nameEn;
    if (p.labelOnly) return t('match.labelOnly');
    return t(hasOwnMicros(p) ? 'usda.matchNone' : 'match.noneFound');
  }

  const row = (p: Product, check: boolean) => (
    <li key={p.id} className="fav-row">
      <a className="result" href={href('food', p.id)}>
        <span className="result-name">{productLabel(p)}</span>
        <span className="small">{status(p)}</span>
        <span className="muted small">
          {productTag(p)}
          {logged.get(p.id) ? ` · ${t('match.logged', { n: logged.get(p.id)! })}` : ''}
        </span>
      </a>
      {check && p.match && (
        <button className="btn btn-small btn-secondary" onClick={() => void confirm(p)}>
          {t('match.confirm')}
        </button>
      )}
    </li>
  );

  return (
    <SubPage title={t('match.title')}>
      <p className="muted small">{t('match.intro')}</p>
      <h2 className="section-title">{t('match.sectionCheck')}</h2>
      {toCheck.length ? <ul className="result-list card product-check">{toCheck.map((p) => row(p, true))}</ul> : <p className="muted">{t('match.allChecked')}</p>}
      {checked.length > 0 && (
        <>
          <h2 className="section-title">{t('match.sectionDone')}</h2>
          <ul className="result-list card product-check">{checked.map((p) => row(p, false))}</ul>
        </>
      )}
    </SubPage>
  );
}
