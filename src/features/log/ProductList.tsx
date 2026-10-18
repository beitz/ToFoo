import { t } from '../../i18n';
import { productLabel, productRef } from '../../foods/products';
import type { Product } from '../../storage/types';
import { FavouriteStar } from './FavouriteButton';

export function productTag(p: Product): string {
  if (p.source === 'USDA') return t(p.usdaType === 'Branded' ? 'usda.brandedTag' : 'usda.tag');
  return t('off.productTag');
}

/** `pinnable`: products already saved on this phone can be pinned; fresh USDA results are not saved until picked. */
export function ProductList({ products, onPick, pinnable }: { products: Product[]; onPick: (p: Product) => void; pinnable?: boolean }) {
  return (
    <ul className="result-list">
      {products.map((p) => (
        <li key={p.id} className={pinnable ? 'fav-row' : undefined}>
          <button className="result" onClick={() => onPick(p)}>
            <span className="result-name">{productLabel(p)}</span>
            <span className="muted small">
              {productTag(p)}
              {p.quantity ? ` · ${p.quantity}` : ''}
            </span>
          </button>
          {pinnable && <FavouriteStar foodRef={productRef(p)} name={productLabel(p)} />}
        </li>
      ))}
    </ul>
  );
}
