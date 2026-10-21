import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { hasOwnMicros, productLabel, productPageUrl } from '../../foods/products';
import { initialChoice, rankMatches, withChoice, type MatchChoice } from '../../foods/productMatch';
import { search } from '../../foods/search';
import { fmtAmount, fmtNumber } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { repo } from '../../storage/repo';
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
export function MatchPicker({ product, choice, onChange, linked }: { product: Product; choice: MatchChoice; onChange: (c: MatchChoice) => void; linked?: boolean }) {
  const d = useData();
  // USDA generic foods have their own vitamins and minerals, so the picker starts closed.
  const own = hasOwnMicros(product);
  const match = choice.food;
  const [open, setOpen] = useState(!match && choice.auto && !own);
  const [query, setQuery] = useState('');
  const options = useMemo(() => {
    const keys = query.trim()
      ? search(d.searchIndex, query, { limit: SUGGESTIONS, boost: d.searchBoost }).map((r) => r.key)
      : rankMatches(product, d.searchIndex, d.searchBoost)
          .slice(0, SUGGESTIONS)
          .map((r) => r.key);
    return keys.map((k) => d.foods.byCode.get(k)).filter((f): f is Food => !!f);
  }, [query, product, d.searchIndex, d.searchBoost, d.foods]);

  return (
    <div className="field match-picker">
      <span className="field-label">{t(own ? 'usda.matchLabel' : 'off.matchLabel')}</span>
      <div className="row-between">
        <span>
          {match ? (
            linked ? <a href={href('food', match.code)}>{match.nameEn}</a> : match.nameEn
          ) : (
            <span className="muted">{t(!choice.auto ? 'match.labelOnly' : own ? 'usda.matchNone' : 'match.noneFound')}</span>
          )}
        </span>
        {!open && (
          <button className="btn btn-small btn-ghost" onClick={() => setOpen(true)}>
            {t('off.matchChange')}
          </button>
        )}
      </div>
      {match && choice.auto && !open && (
        <div className="row-between match-auto">
          <span className="muted small">{t('match.auto')}</span>
          <button className="btn btn-small btn-secondary" onClick={() => onChange({ food: match, auto: false })}>
            {t('match.confirm')}
          </button>
        </div>
      )}
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
                    onChange({ food: f, auto: false });
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
          <button
            className="btn btn-small btn-ghost"
            onClick={() => {
              onChange({ auto: false });
              setOpen(false);
            }}
          >
            {t(own ? 'usda.matchNone' : 'off.matchClear')}
          </button>
        </>
      )}
    </div>
  );
}

/** The sheets' choice of similar food: the saved one, else the app's pick; and the product as it will be saved. */
export function useMatchChoice(product: Product | undefined) {
  const d = useData();
  const start = (p: Product | undefined, guess?: Food): MatchChoice => {
    if (!p) return { auto: true };
    // The food a replaced entry or ingredient had is a better first guess than a name search.
    if (guess && !p.match && !p.labelOnly) return { food: guess, auto: true };
    return initialChoice(p, d.foods, d.searchIndex, d.searchBoost);
  };
  const [choice, setChoice] = useState<MatchChoice>(() => start(product));
  const draft = useMemo(() => (product ? withChoice(product, choice, d.foods.version) : undefined), [product, choice, d.foods.version]);
  /** Start over for another product (picked in the sheet). */
  const reset = (p: Product | undefined, guess?: Food) => setChoice(start(p, guess));
  return { choice, setChoice, draft, reset };
}

/** Save a product with its pairing, as chosen in a sheet. */
export async function saveProductChoice(draft: Product): Promise<void> {
  await repo.saveProduct(draft);
  await repo.setProductMatch(draft.id, draft);
}

/** A saved product's similar food, on its page: checked or changed straight away, with undo. */
export function SavedMatchPicker({ product }: { product: Product }) {
  const d = useData();
  const toast = useToast();
  const food = product.match ? d.foods.byCode.get(product.match.code) : undefined;
  const choice: MatchChoice = food ? { food, auto: !!product.match?.auto } : { auto: !product.labelOnly };
  async function change(c: MatchChoice) {
    const before: Pick<Product, 'match' | 'labelOnly'> = { ...(product.match ? { match: product.match } : {}), ...(product.labelOnly ? { labelOnly: true as const } : {}) };
    await repo.setProductMatch(product.id, withChoice(product, c, d.foods.version));
    const name = productLabel(product);
    toast(c.food ? t('match.saved', { name, food: c.food.nameEn }) : t('match.savedNone', { name }), () => repo.setProductMatch(product.id, before));
  }
  return <MatchPicker key={product.id} product={product} choice={choice} onChange={(c) => void change(c)} linked />;
}
