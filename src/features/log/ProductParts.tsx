import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { findProduct } from '../../foods/findProduct';
import { hasOwnMicros, labelValues, mixedFood, productLabel, productPageUrl } from '../../foods/products';
import { ingredientMix, initialChoice, mixDetail, rankMatches, wantsAutoMatch, withChoice, type MatchChoice } from '../../foods/productMatch';
import { search } from '../../foods/search';
import { fmtAmount, fmtNumber } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { repo } from '../../storage/repo';
import type { MixPart, Product } from '../../storage/types';
import { isOn } from '../../settings/features';
import { Icon } from '../../ui/Icon';

/** Label nutrients shown first, in label order; the rest are counted. */
const LABEL_ORDER = ['ENERCC', 'FAT', 'FASAT', 'CHO', 'SUGAR', 'FIBT', 'PROT625'];
/** Labels give salt in g; BLS tracks sodium in mg (salt = sodium × 2.5). */
const SALT_G_PER_SODIUM_MG = 2.5 / 1000;
const SUGGESTIONS = 6;
/** A ready meal's biggest parts shown before "All n". */
const MIX_ROWS = 4;

/** Brand, pack size, a link to the source page, and the label (or USDA) values. */
export function ProductInfo({ product }: { product: Product }) {
  const p = labelValues(product);
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

/** Choose the BLS food whose vitamins and minerals stand in for what the label (or USDA) lacks, or a ready meal's ingredients. */
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
      : rankMatches(product, d.searchIndex, d.foods, d.searchBoost)
          .slice(0, SUGGESTIONS)
          .map((r) => r.key);
    return keys.map((k) => d.foods.byCode.get(k)).filter((f): f is Food => !!f);
  }, [query, product, d.searchIndex, d.searchBoost, d.foods]);
  const mix = useMemo(() => ingredientMix(product, d.foods), [product, d.foods]);
  const pick = (c: MatchChoice) => {
    onChange(c);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="field match-picker">
      <span className="field-label">{t(own ? 'usda.matchLabel' : 'off.matchLabel')}</span>
      <div className="row-between">
        <span>
          {match ? (
            choice.parts ? (
              t('match.mixName', { n: choice.parts.length })
            ) : linked ? (
              <a href={href('food', match.code)}>{match.nameEn}</a>
            ) : (
              match.nameEn
            )
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
      {choice.parts && <MixList product={product} parts={choice.parts} linked={linked} />}
      {match && choice.auto && !open && (
        <div className="row-between match-auto">
          <span className="muted small">{t('match.auto')}</span>
          <button className="btn btn-small btn-secondary" onClick={() => onChange({ ...choice, auto: false })}>
            {t('match.confirm')}
          </button>
        </div>
      )}
      <div className="field-hint">{t(choice.parts ? 'match.mixHint' : own ? 'usda.matchHint' : 'off.matchHint')}</div>
      {linked && product.source === 'OFF' && product.ingredients === undefined && !choice.parts && <FetchIngredients product={product} />}
      {open && (
        <>
          <div className="search-box">
            <Icon name="search" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('off.matchSearch')} aria-label={t('off.matchSearch')} />
          </div>
          {!query.trim() && options.length > 0 && <p className="muted small">{t(product.source === 'USDA' ? 'usda.matchSuggested' : 'off.matchSuggested')}</p>}
          <ul className="result-list">
            {!query.trim() && mix && (
              <li>
                <button
                  className={`result${choice.parts ? ' on' : ''}`}
                  onClick={() => {
                    const food = d.foods.byCode.get(mix[0]!.code);
                    if (food) pick({ food, parts: mix, auto: false });
                  }}
                >
                  <span className="result-name">{t('match.mixOption', { n: mix.length })}</span>
                  <span className="muted small">{mix.slice(0, 3).map((p) => d.foods.byCode.get(p.code)?.nameEn).join(', ')}…</span>
                </button>
              </li>
            )}
            {options.map((f) => (
              <li key={f.code}>
                <button className={`result${match?.code === f.code && !choice.parts ? ' on' : ''}`} onClick={() => pick({ food: f, auto: false })}>
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

/** A ready meal's BLS foods with their share and the ingredients they stand for, what was left out, and how its energy compares with the label. */
function MixList({ product, parts, linked }: { product: Product; parts: MixPart[]; linked?: boolean }) {
  const d = useData();
  const [all, setAll] = useState(false);
  const { rows, leftOut } = mixDetail(product, parts);
  const shown = all ? rows : rows.slice(0, MIX_ROWS);
  const mix = mixedFood(parts, d.foods);
  const kcal = mix?.per100.ENERCC;
  const label = labelValues(product).ENERCC;
  return (
    <div className="mix-list">
      <p className="small muted">{t('match.mixTitle')}</p>
      <ul className="small">
        {shown.map((r) => {
          const name = d.foods.byCode.get(r.code)?.nameEn ?? r.code;
          return (
            <li key={r.code}>
              <span className="mix-share">{fmtNumber(r.share, r.share < 10 ? 1 : 0)} %</span>
              <span>
                {linked ? <a href={href('food', r.code)}>{name}</a> : name}
                {r.texts.length > 0 && <span className="muted"> · {r.texts.join(', ')}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > MIX_ROWS && (
        <button className="btn btn-small btn-ghost" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? t('match.mixFewer') : t('match.mixAll', { n: rows.length })}
        </button>
      )}
      {all && leftOut.texts.length > 0 && <p className="small muted">{t('match.mixLeftOut', { pct: `${fmtNumber(leftOut.percent, 0)} %`, names: leftOut.texts.join(', ') })}</p>}
      {typeof kcal === 'number' && label !== undefined && <p className="small muted">{t('match.mixEnergy', { mix: fmtNumber(kcal, 0), label: fmtNumber(label, 0) })}</p>}
    </div>
  );
}

/**
 * Products saved before ingredient lists were kept: one tap asks Open Food Facts for it (only with
 * the lookup on), then the app's own unchecked pick becomes the mix when one fits.
 */
function FetchIngredients({ product }: { product: Product }) {
  const d = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  if (!isOn(d.settings.features, 'openFoodFacts')) return null;
  async function fetchList() {
    setBusy(true);
    setNote('');
    const r = await findProduct(product.code, { refresh: true });
    setBusy(false);
    if (r.kind !== 'found') {
      setNote(r.kind === 'error' ? r.detail : t('match.fetchNone'));
      return;
    }
    // Saving keeps the pairing; the label values come fresh, as when a product is logged again.
    const saved = await repo.saveProduct(r.product);
    const parts = ingredientMix(saved, d.foods);
    if (!saved.ingredients?.length) setNote(t('match.fetchNone'));
    else if (!parts) setNote(t('match.fetchNoMix'));
    else if (wantsAutoMatch(saved)) {
      await repo.setAutoMatches([{ id: saved.id, match: { version: d.foods.version, code: parts[0]!.code, parts } }]);
      toast(t('match.saved', { name: productLabel(saved), food: t('match.mixName', { n: parts.length }) }));
    } else toast(t('match.fetchChoose'));
  }
  return (
    <div className="mix-fetch">
      <button className="btn btn-small btn-secondary" disabled={busy} onClick={() => void fetchList()}>
        {t('match.fetchIngredients')}
      </button>
      <p className="small muted">{note || t('match.fetchIngredientsHint')}</p>
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
  const choice: MatchChoice = food ? { food, ...(product.match?.parts ? { parts: product.match.parts } : {}), auto: !!product.match?.auto } : { auto: !product.labelOnly };
  async function change(c: MatchChoice) {
    const before: Pick<Product, 'match' | 'labelOnly'> = { ...(product.match ? { match: product.match } : {}), ...(product.labelOnly ? { labelOnly: true as const } : {}) };
    await repo.setProductMatch(product.id, withChoice(product, c, d.foods.version));
    const name = productLabel(product);
    const what = c.parts ? t('match.mixName', { n: c.parts.length }) : c.food?.nameEn;
    toast(what ? t('match.saved', { name, food: what }) : t('match.savedNone', { name }), () => repo.setProductMatch(product.id, before));
  }
  return <MatchPicker key={product.id} product={product} choice={choice} onChange={(c) => void change(c)} linked />;
}
