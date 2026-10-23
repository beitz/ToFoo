import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { search } from '../../foods/search';
import { isOn } from '../../settings/features';
import { Icon } from '../../ui/Icon';
import { FoodList } from '../log/FoodList';
import type { PickedFood } from '../log/FoodPicker';
import { ProductList } from '../log/ProductList';
import { UsdaResults } from '../log/UsdaResults';
import { OffResults, useOffSearch } from '../log/OffResults';

/**
 * Find an ingredient: the same sources as the log screen (BLS, products saved on this phone, USDA
 * on a tap, a barcode scan), without saved items, manual entry or drinks, which are not "a food in
 * grams". Nothing is listed until something is typed, so the editor stays short.
 */
export function IngredientSearch({ onPick, onScan }: { onPick: (p: PickedFood) => void; onScan: () => void }) {
  const d = useData();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const offOn = isOn(d.settings.features, 'openFoodFacts');
  const usdaOn = isOn(d.settings.features, 'usda');
  const results = useMemo(
    () =>
      q
        ? search(d.searchIndex, q, { limit: 12, recent: d.recentFoods, boost: d.searchBoost })
            .map((r) => d.foods.byCode.get(r.key))
            .filter((f): f is Food => !!f)
        : [],
    [q, d.searchIndex, d.recentFoods, d.searchBoost, d.foods],
  );
  // Products looked up before stay on this phone and are found by name without any request.
  const products = useMemo(() => {
    if (!q || !(offOn || usdaOn)) return [];
    const lower = q.toLowerCase();
    return d.products.filter((p) => `${p.name} ${p.brand ?? ''} ${p.code}`.toLowerCase().includes(lower));
  }, [q, d.products, offOn, usdaOn]);

  const offSearch = useOffSearch(q, offOn, results);

  function pick(p: PickedFood) {
    setQuery('');
    onPick(p);
  }

  return (
    <div className="ingredient-search">
      <div className="search-row">
        <div className="search-box">
          <Icon name="search" />
          <input type="search" placeholder={t('recipes.addIngredient')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('recipes.addIngredient')} />
        </div>
        {offOn && (
          <button className="icon-btn scan-btn" onClick={onScan} aria-label={t('off.scan')} title={t('off.scan')}>
            <Icon name="barcode" />
          </button>
        )}
      </div>
      {q && products.length > 0 && <ProductList pinnable products={products} onPick={(product) => pick({ product })} />}
      {q && !offSearch.genericFirst && <OffResults key={q} search={offSearch} onPick={(product) => pick({ product })} />}
      {q && <FoodList foods={results} onPick={(food) => pick({ food })} />}
      {q && offSearch.genericFirst && <OffResults key={q} search={offSearch} onPick={(product) => pick({ product })} />}
      {q && results.length === 0 && products.length === 0 && offSearch.hits.length === 0 && offSearch.status !== 'loading' && <p className="muted">{t(offOn ? 'edit.noResultsScan' : 'edit.noResults')}</p>}
      {q && usdaOn && <UsdaResults key={q} query={q} onPick={(product) => pick({ product })} />}
    </div>
  );
}
