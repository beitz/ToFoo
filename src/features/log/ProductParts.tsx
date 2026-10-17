import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { hasOwnMicros, matchQueries, productPageUrl } from '../../foods/products';
import { search } from '../../foods/search';
import { fmtAmount, fmtNumber } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';

/** Label nutrients shown first, in label order; the rest are counted. */
const LABEL_ORDER = ['ENERCC', 'FAT', 'FASAT', 'CHO', 'SUGAR', 'FIBT', 'PROT625'];
/** Labels give salt in g; BLS tracks sodium in mg (salt = sodium × 2.5). */
const SALT_G_PER_SODIUM_MG = 2.5 / 1000;
const SUGGESTIONS = 6;

/** Brand, pack size, a link to the source page, and the label (or USDA) values. */
export function ProductInfo({ product }: { product: Product }) {
  const p = product.per100;
  const own = hasOwnMicros(product);
  const shown = LABEL_ORDER.filter((id) => p[id] !== undefined);
  const more = Object.keys(p).filter((id) => !LABEL_ORDER.includes(id) && id !== 'NA').length;
  return (
    <div className="product-info">
      <p className="muted small">
        {[product.brand, product.quantity].filter(Boolean).join(' · ')}
        {product.brand || product.quantity ? ' · ' : ''}
        <a href={productPageUrl(product)} target="_blank" rel="noreferrer">
          {t(product.source === 'USDA' ? 'usda.viewOnUsda' : 'off.viewOnOff')}
        </a>
      </p>
      {shown.length === 0 && p.NA === undefined ? (
        <p className="notice small" role="alert">
          <Icon name="alert" size={16} /> {t(product.source === 'USDA' ? 'usda.noValues' : 'off.noValues')}
        </p>
      ) : (
        <p className="small label-values">
          <span className="muted">{t(own ? (product.perMl ? 'usda.per100ml' : 'usda.per100g') : product.perMl ? 'off.labelPer100ml' : 'off.labelPer100g')} </span>
          {shown.map((id) => `${NUTRIENT_BY_ID.get(id)?.short ?? id} ${fmtAmount(id, p[id]!)}`).join(' · ')}
          {p.NA !== undefined && ` · ${t('manual.salt')} ${fmtNumber(p.NA * SALT_G_PER_SODIUM_MG, 2)} g`}
          {more > 0 && ` · ${t(own ? 'usda.more' : 'off.moreOnLabel', { n: more })}`}
        </p>
      )}
    </div>
  );
}

/** Choose the BLS food whose vitamins and minerals stand in for what the label (or USDA) lacks. */
export function MatchPicker({ product, match, onChange }: { product: Product; match: Food | undefined; onChange: (f: Food | undefined) => void }) {
  const d = useData();
  // USDA generic foods have their own vitamins and minerals, so the picker starts closed.
  const own = hasOwnMicros(product);
  const [open, setOpen] = useState(!match && !own);
  const [query, setQuery] = useState('');
  const options = useMemo(() => {
    const opts = { limit: SUGGESTIONS, boost: d.searchBoost };
    const keys = query.trim()
      ? search(d.searchIndex, query, opts).map((r) => r.key)
      : [...new Set(matchQueries(product).flatMap((q) => search(d.searchIndex, q, { ...opts, limit: 2 }).map((r) => r.key)))].slice(0, SUGGESTIONS);
    return keys.map((k) => d.foods.byCode.get(k)).filter((f): f is Food => !!f);
  }, [query, product, d.searchIndex, d.searchBoost, d.foods]);

  return (
    <div className="field match-picker">
      <span className="field-label">{t(own ? 'usda.matchLabel' : 'off.matchLabel')}</span>
      <div className="row-between">
        <span>{match ? match.nameEn : <span className="muted">{t(own ? 'usda.matchNone' : 'off.matchNone')}</span>}</span>
        {!open && (
          <button className="btn btn-small btn-ghost" onClick={() => setOpen(true)}>
            {t('off.matchChange')}
          </button>
        )}
      </div>
      <div className="field-hint">{t(own ? 'usda.matchHint' : 'off.matchHint')}</div>
      {open && (
        <>
          <div className="search-box">
            <Icon name="search" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('off.matchSearch')} aria-label={t('off.matchSearch')} />
          </div>
          {!query.trim() && options.length > 0 && <p className="muted small">{t(product.source === 'USDA' ? 'usda.matchSuggested' : 'off.matchSuggested')}</p>}
          <ul className="result-list">
            {options.map((f) => (
              <li key={f.code}>
                <button
                  className={`result${match?.code === f.code ? ' on' : ''}`}
                  onClick={() => {
                    onChange(f);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="result-name">{f.nameEn}</span>
                  <span className="muted small">
                    {f.nameDe} · {d.foods.groups[f.group]?.en}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {match && (
            <button
              className="btn btn-small btn-ghost"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              {t(own ? 'usda.matchNone' : 'off.matchClear')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
