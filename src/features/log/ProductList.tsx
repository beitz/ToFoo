import { t } from '../../i18n';
import { productLabel } from '../../foods/products';
import type { Product } from '../../storage/types';

export function productTag(p: Product): string {
  if (p.source === 'USDA') return t(p.usdaType === 'Branded' ? 'usda.brandedTag' : 'usda.tag');
  return t('off.productTag');
}

export function ProductList({ products, onPick }: { products: Product[]; onPick: (p: Product) => void }) {
  return (
    <ul className="result-list">
      {products.map((p) => (
        <li key={p.id}>
          <button className="result" onClick={() => onPick(p)}>
            <span className="result-name">{productLabel(p)}</span>
            <span className="muted small">
              {productTag(p)}
              {p.quantity ? ` · ${p.quantity}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
