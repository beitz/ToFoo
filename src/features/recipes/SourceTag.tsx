import { t, type MessageKey } from '../../i18n';
import type { FoodRef, Product } from '../../storage/types';

type Source = FoodRef['source'];
import { Icon } from '../../ui/Icon';

/** Where an ingredient's numbers come from, as a tiny label: a generic BLS food, a scanned product, USDA… */
export function sourceKey(source: Source, product?: Product): MessageKey {
  if (source === 'BLS') return 'source.bls';
  if (source === 'OFF') return 'source.off';
  if (source === 'USDA') return product?.usdaType === 'Branded' ? 'source.usdaBranded' : 'source.usda';
  return 'source.custom';
}

export function SourceTag({ source, product }: { source: Source; product?: Product }) {
  return (
    <span className="source-tag">
      {source === 'OFF' && <Icon name="barcode" size={12} />}
      {t(sourceKey(source, product))}
    </span>
  );
}
