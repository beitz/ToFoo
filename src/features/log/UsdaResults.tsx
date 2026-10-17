import { useState } from 'react';
import { t, type MessageKey } from '../../i18n';
import { findUsda, type UsdaFindResult } from '../../foods/findProduct';
import type { Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { ProductList } from './ProductList';

/**
 * USDA search for the log screen. It runs only on a tap, never while typing: each search is an
 * online request, and the shared demo key allows only a few a day.
 */
export function UsdaResults({ query, onPick }: { query: string; onPick: (p: Product) => void }) {
  const [state, setState] = useState<'idle' | 'loading' | UsdaFindResult>('idle');

  async function run() {
    setState('loading');
    setState(await findUsda(query));
  }

  if (state === 'idle' || (typeof state === 'object' && state.kind === 'error')) {
    return (
      <div className="usda-search">
        {typeof state === 'object' && state.kind === 'error' && (
          <p className="notice small" role="alert">
            <Icon name="alert" size={16} /> {t(`usda.error.${state.reason}` as MessageKey)}
          </p>
        )}
        <button className="btn btn-secondary btn-block" onClick={() => void run()}>
          <Icon name="search" /> {t('usda.search', { q: query })}
        </button>
        <p className="muted small">{t('usda.privacy')}</p>
      </div>
    );
  }
  if (state === 'loading') return <p className="muted" role="status">{t('usda.searching')}</p>;

  const generic = state.products.filter((p) => p.usdaType !== 'Branded');
  const branded = state.products.filter((p) => p.usdaType === 'Branded');
  return (
    <div className="usda-results">
      <h2 className="section-title">{t('usda.heading')}</h2>
      {state.products.length === 0 && <p className="muted">{t('usda.none', { q: query })}</p>}
      {generic.length > 0 && (
        <>
          <p className="muted small">{t('usda.generic')}</p>
          <ProductList products={generic} onPick={onPick} />
        </>
      )}
      {branded.length > 0 && (
        <>
          <p className="muted small">{t('usda.branded')}</p>
          <ProductList products={branded} onPick={onPick} />
        </>
      )}
    </div>
  );
}
