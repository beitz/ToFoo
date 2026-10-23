import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { findProduct } from '../../foods/findProduct';
import { loadOffIndex, searchOffIndex, wordStartsMatch, type OffIndex, type OffListing } from '../../foods/offIndex';
import type { Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { LOOKUP_ERRORS } from './BarcodeSheet';

/** Products shown before "Show more": enough to spot the right one, few enough to keep generic foods in view. */
const FIRST = 5;
const MORE = 20;

export type OffSearch = ({ status: 'idle' | 'loading' | 'ready' } | { status: 'error'; detail: string }) & {
  hits: OffListing[];
  /** Whether generic foods are listed first: a brand name ("pick up") finds only typo-level ones, then products lead. */
  genericFirst: boolean;
};

/**
 * Search the bundled list of Open Food Facts products (src/foods/offIndex.ts). The list loads on the
 * first search, not at start, since only people who search for products need it. Products saved on
 * this phone are left out: the search screens list them already. `generic`: the BLS foods found.
 */
export function useOffSearch(query: string, on: boolean, generic: ReadonlyArray<{ nameEn: string; nameDe: string }>): OffSearch {
  const d = useData();
  const exclude = useMemo(() => new Set(d.products.filter((p) => p.source === 'OFF').map((p) => p.code)), [d.products]);
  const genericFirst = generic.slice(0, 5).some((f) => wordStartsMatch(f.nameEn, query) || wordStartsMatch(f.nameDe, query));
  const [index, setIndex] = useState<OffIndex | { error: string } | null>(null);
  const q = useDeferredValue(query.trim());
  const wanted = on && q.length >= 2;
  const loaded = !!index && !('error' in index);
  useEffect(() => {
    if (!wanted || loaded) return;
    let live = true;
    loadOffIndex(import.meta.env.BASE_URL).then(
      (i) => live && setIndex(i),
      (e: unknown) => live && setIndex({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
    // Tried again when the query changes after a failure (e.g. offline on first use).
  }, [wanted, q, loaded]);
  const hits = useMemo(() => (wanted && index && !('error' in index) ? searchOffIndex(index, q, { limit: MORE, exclude }) : []), [wanted, index, q, exclude]);
  if (!wanted) return { status: 'idle', hits: [], genericFirst };
  if (!index) return { status: 'loading', hits: [], genericFirst };
  if ('error' in index) return { status: 'error', hits: [], detail: index.error, genericFirst };
  return { status: 'ready', hits, genericFirst };
}

type Looking = { code: string; error?: undefined } | { code: string; error: string; detail?: string } | null;

/** The products found by name. Picking one fetches its label values by barcode, as a scan would. */
export function OffResults({ search, onPick }: { search: OffSearch; onPick: (p: Product) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [looking, setLooking] = useState<Looking>(null);
  if (search.status === 'idle') return null;
  if (search.status === 'loading') return <p className="muted small" role="status">{t('offList.loading')}</p>;
  if (search.status === 'error')
    return (
      <p className="notice small" role="alert">
        <Icon name="alert" size={16} /> {t('offList.loadFailed')}
        <span className="muted small block error-detail">{t('off.error.detail', { detail: search.detail })}</span>
      </p>
    );
  if (!search.hits.length) return null;

  async function pick(row: OffListing) {
    if (looking && !looking.error) return;
    setLooking({ code: row.code });
    const r = await findProduct(row.code);
    if (r.kind === 'found') {
      setLooking(null);
      onPick(r.product);
    } else if (r.kind === 'notFound') setLooking({ code: row.code, error: t('offList.notFound') });
    else setLooking({ code: row.code, error: t(LOOKUP_ERRORS[r.reason]), ...(r.detail ? { detail: r.detail } : {}) });
  }

  const rows = showAll ? search.hits : search.hits.slice(0, FIRST);
  return (
    <div className="off-results">
      <h2 className="section-title">{t('offList.heading')}</h2>
      <ul className="result-list">
        {rows.map((row) => {
          const here = looking?.code === row.code ? looking : null;
          return (
            <li key={row.code}>
              <button className="result" onClick={() => void pick(row)} aria-busy={!!here && !here.error}>
                <span className="result-name">{row.name}</span>
                <span className="muted small">{here && !here.error ? t('offList.looking') : [row.brand, row.quantity].filter(Boolean).join(' · ')}</span>
              </button>
              {here?.error && (
                <p className="notice small" role="alert">
                  <Icon name="alert" size={16} /> {here.error}
                  {here.detail && <span className="muted small block error-detail">{t('off.error.detail', { detail: here.detail })}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {!showAll && search.hits.length > FIRST && (
        <button className="btn btn-small btn-ghost" onClick={() => setShowAll(true)}>
          {t('offList.more')}
        </button>
      )}
      <p className="muted small">{t('offList.privacy')}</p>
    </div>
  );
}
