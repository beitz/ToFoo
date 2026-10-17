import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { search } from '../../foods/search';
import { isOn } from '../../settings/features';
import type { Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { FoodList } from './FoodList';
import { ProductList } from './ProductList';
import { UsdaResults } from './UsdaResults';

export type PickedFood = { food: Food; product?: undefined } | { product: Product; food?: undefined };

/** Saved products and recent foods offered before anything is typed. */
const SUGGESTIONS = 6;

/**
 * Find another food for an entry: the same sources as the log screen (BLS, saved products, USDA on
 * a tap, a barcode scan), without saved items, manual entry or drinks, which are not "a food in grams".
 */
export function FoodPicker({ onPick, onScan, onCancel }: { onPick: (p: PickedFood) => void; onScan: () => void; onCancel: () => void }) {
  const d = useData();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const offOn = isOn(d.settings.features, 'openFoodFacts');
  const usdaOn = isOn(d.settings.features, 'usda');
  const results = useMemo(
    () => (q ? search(d.searchIndex, q, { limit: 30, recent: d.recentFoods, boost: d.searchBoost }).map((r) => d.foods.byCode.get(r.key)).filter((f): f is Food => !!f) : []),
    [q, d.searchIndex, d.recentFoods, d.searchBoost, d.foods],
  );
  const products = useMemo(() => {
    if (!q) return d.products.slice(0, SUGGESTIONS);
    const lower = q.toLowerCase();
    return d.products.filter((p) => `${p.name} ${p.brand ?? ''} ${p.code}`.toLowerCase().includes(lower));
  }, [q, d.products]);
  const recent = useMemo(
    () =>
      [...d.recentFoods.entries()]
        .filter(([, v]) => v > 0.3)
        .slice(0, SUGGESTIONS)
        .map(([code]) => d.foods.byCode.get(code))
        .filter((f): f is Food => !!f),
    [d.recentFoods, d.foods],
  );

  return (
    <div className="food-picker">
      <div className="row-between">
        <span className="field-label">{t('edit.pickTitle')}</span>
        <button className="btn btn-small btn-ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
      <div className="search-row">
        <div className="search-box">
          <Icon name="search" />
          <input type="search" autoFocus placeholder={t('log.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('log.searchPlaceholder')} />
        </div>
        {offOn && (
          <button className="icon-btn scan-btn" onClick={onScan} aria-label={t('off.scan')} title={t('off.scan')}>
            <Icon name="barcode" />
          </button>
        )}
      </div>
      {!q && offOn && <p className="muted small">{t('edit.scanHint')}</p>}
      {(offOn || usdaOn) && products.length > 0 && (
        <>
          {!q && <h3 className="section-title">{t(usdaOn ? 'products.saved' : 'off.products')}</h3>}
          <ProductList products={products} onPick={(product) => onPick({ product })} />
        </>
      )}
      {!q && recent.length > 0 && (
        <>
          <h3 className="section-title">{t('log.recent')}</h3>
          <FoodList foods={recent} onPick={(food) => onPick({ food })} />
        </>
      )}
      {q && <FoodList foods={results} onPick={(food) => onPick({ food })} />}
      {q && results.length === 0 && products.length === 0 && <p className="muted">{t(offOn ? 'edit.noResultsScan' : 'edit.noResults')}</p>}
      {q && usdaOn && <UsdaResults key={q} query={q} onPick={(product) => onPick({ product })} />}
    </div>
  );
}
