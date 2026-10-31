import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useData, type AppData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { dayKey, formatDay, formatTime } from '../../lib/dates';
import { fmtAmount, fmtGrams, fmtPercent } from '../../lib/format';
import {
  biggestShares,
  breakdown,
  composition,
  entryWeight,
  shareRows,
  type Basis,
  type Breakdown,
  type Composition,
  type Piece,
  type ShareRow,
  type SourceLetter,
  SOURCE_LETTERS,
} from '../../logic/mealNutrients';
import { hasOwnMicros, isProductCode, productPageUrl } from '../../foods/products';
import { refKey } from '../../lib/refs';
import { NUTRIENTS, NUTRIENT_BY_ID } from '../../model/nutrients';
import { groupMeals } from '../../model/simulate';
import type { ModelEntry } from '../../model/types';
import { isOn } from '../../settings/features';
import type { LogEntry } from '../../storage/types';
import { Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { nutrientType } from '../home/grouping';
import { GroupInfoButton, groupTitle, hasGroupInfo } from '../info/GroupInfo';
import { EditEntrySheet } from '../diary/EditEntrySheet';
import { entryAmount } from '../log/describe';
import { foodHref, refOfCode } from '../food/links';
import { FoodActions } from '../food/FoodActions';
import { FavouriteMealButton } from '../log/FavouriteButton';
import { BackButton } from '../../ui/BackButton';
import { pairingName } from '../food/pairingName';
import { chosenSize, fmtSize, sizeButton, sizeValue, switchClass, useFoodSizes, type SizeChoice } from '../food/sizes';
import type { Product } from '../../storage/types';

const MACROS = ['PROT625', 'FAT', 'CHO', 'FIBT'];

/** The BLS 4.0 dataset (Max Rubner-Institut), as cited in data/README.md. */
const BLS_URL = 'https://doi.org/10.25826/Data20251217-134202-0';

/** The diary's meal (same grouping) that holds this entry. */
export function mealOf(d: AppData, entry: LogEntry): LogEntry[] {
  const meals = groupMeals(
    d.log.filter((e) => e.day === entry.day),
    d.settings.mealWindowMinutes,
  );
  return meals.find((m) => m.some((e) => e.id === entry.id)) ?? [entry];
}

/** What an entry weighed (see entryWeight); a drink mark weighs nothing and gives nothing. */
function weightOf(d: AppData, e: LogEntry, model: ModelEntry | undefined): Weight | 'none' {
  if (e.kind === 'drink') return 'none';
  return entryWeight(e, {
    batch: e.kind === 'portion' ? d.batchesById.get(e.batchId) : undefined,
    custom: e.kind === 'custom' ? d.customFoodsById.get(e.customFoodId) : undefined,
    parts: model?.parts,
  });
}

/** A meal's weight: the sum of its items', unknown when one of them is. */
function mealWeight(d: AppData, meal: readonly LogEntry[], entries: ReadonlyMap<string, ModelEntry>): Weight {
  let grams = 0;
  let raw = false;
  for (const e of meal) {
    const w = weightOf(d, e, entries.get(e.id));
    if (w === 'none') continue;
    if (!w) return undefined;
    grams += w.grams;
    raw ||= w.raw;
  }
  return grams > 0 ? { grams, raw } : undefined;
}

/** Amounts and absorbed amounts of some pieces of the log (see logic/mealNutrients.ts). */
export function useMealBreakdown(pieces: readonly Piece[]) {
  return useBreakdown(pieces).b;
}

function useBreakdown(pieces: readonly Piece[]) {
  const d = useData();
  const entries = useMemo(() => new Map<string, ModelEntry>(d.modelEntries.map((e) => [e.id, e])), [d.modelEntries]);
  const retention = isOn(d.settings.features, 'retention');
  const key = pieces.map((p) => `${p.entryId}:${p.part ?? ''}`).join(',');
  // `key` stands for `pieces`, a new array on every render.
  const b = useMemo(() => breakdown(pieces, entries, d.model.meals, { retention }), [key, entries, d.model.meals, retention]);
  return { b, entries, retention };
}

function Header({ title }: { title: string }) {
  return (
    <header className="page-head row">
      <BackButton to={['diary']} />
      <h1 className="grow">{title}</h1>
    </header>
  );
}

function NotFound() {
  return (
    <section>
      <Header title={t('mealNutrients.title')} />
      <p className="muted empty">{t('mealNutrients.notFound')}</p>
      <a className="btn btn-secondary btn-block" href={href('diary')}>
        <Icon name="diary" /> {t('nav.diary')}
      </a>
    </section>
  );
}

/** One meal's nutrients and its items. Route: #/meal/<id of any entry in it>. */
export function MealNutrientsPage({ entryId }: { entryId: string }) {
  const d = useData();
  const entry = d.log.find((e) => e.id === entryId);
  const meal = entry ? mealOf(d, entry) : [];
  const pieces = meal.map((e) => ({ entryId: e.id }));
  const { b, entries, retention } = useBreakdown(pieces);
  if (!entry) return <NotFound />;
  const first = meal[0]!;
  const kcalOf = (id: string) => breakdown([{ entryId: id }], entries, d.model.meals, { retention }).intake.ENERCC;
  return (
    <section>
      <Header title={t('mealNutrients.mealAt', { time: formatTime(first.time) })} />
      <p className="muted">
        {formatDay(first.day, d.today)} · <a href={href('diary', first.day)}>{t('mealNutrients.inDiary')}</a>
      </p>
      <FavouriteMealButton meal={meal} />
      <h2 className="section-title">{t('mealNutrients.items', { n: meal.length })}</h2>
      <div className="card">
        <ul className="plain-list">
          {meal.map((e) => {
            const kcal = kcalOf(e.id);
            return (
              <li key={e.id}>
                <a className="entry-row" href={href('entry', e.id)}>
                  <span className="entry-label">{e.label}</span>
                  <span className="muted small">
                    {entryAmount(e, d)}
                    {kcal ? ` · ${fmtAmount('ENERCC', kcal)}` : ''}
                  </span>
                  <span className="entry-edit">
                    <Icon name="chevron" size={16} />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
      <NutrientBreakdown
        b={b}
        weight={mealWeight(d, meal, entries)}
        nutrientHref={(id) => (meal.length > 1 ? href('nutrient', id, 'meal', entry.id) : (entries.get(entry.id)?.parts.length ?? 0) > 1 ? href('nutrient', id, 'entry', entry.id) : href('nutrient', id))}
      />
    </section>
  );
}

/** One entry, or one ingredient of a recipe portion. Route: #/entry/<id>[/<ingredient index>]. */
export function EntryNutrientsPage({ entryId, part: partParam }: { entryId: string; part?: string }) {
  const d = useData();
  const [editing, setEditing] = useState(false);
  const entry = d.log.find((e) => e.id === entryId);
  const part = partParam !== undefined && /^\d+$/.test(partParam) ? Number(partParam) : undefined;
  const { b, entries, retention } = useBreakdown([{ entryId, part }]);
  if (!entry) return <NotFound />;
  const model = entries.get(entry.id);
  const ingredient = part !== undefined ? model?.parts[part] : undefined;
  if (part !== undefined && !ingredient) return <NotFound />;
  const meal = mealOf(d, entry);
  const parts = part === undefined && model && model.parts.length > 1 ? model.parts : [];
  // The food behind the item: the ingredient's, or the logged food's (BLS code or product id).
  const code = ingredient ? ingredient.code : entry.kind === 'food' ? (entry.ref.source === 'BLS' ? entry.ref.code : refKey(entry.ref)) : undefined;
  const w = ingredient ? { grams: ingredient.grams, raw: false } : weightOf(d, entry, model);
  // What the item is, one tap away: its food's page, or the recipe a portion was cooked from.
  const batch = !ingredient && entry.kind === 'portion' ? d.batchesById.get(entry.batchId) : undefined;
  const foodTo = foodHref(d, code);
  const about =
    batch && d.recipes.some((r) => r.id === batch.recipeId)
      ? { to: href('recipes', batch.recipeId), icon: 'pot', label: t('mealNutrients.recipe', { name: batch.recipe.name }) }
      : foodTo
        ? { to: foodTo, icon: 'search', label: t('mealNutrients.food') }
        : undefined;
  const weight = w === 'none' ? undefined : w;
  // What can be kept for later: a food, product or saved item; a cooked portion is in the kitchen already.
  const keepRef = ingredient || entry.kind === 'food' ? refOfCode(d, code) : entry.kind === 'custom' && d.customFoodsById.has(entry.customFoodId) ? { source: 'custom' as const, id: entry.customFoodId } : undefined;
  return (
    <section>
      <Header title={ingredient ? ingredient.label : entry.label} />
      <p className="muted">
        {ingredient ? fmtGrams(ingredient.grams) : entryAmount(entry, d)} · {formatDay(entry.day, d.today)} {formatTime(entry.time)}
      </p>
      <div className="row wrap">
        {ingredient ? (
          <a className="btn btn-small btn-ghost" href={href('entry', entry.id)}>
            <Icon name="pot" size={16} /> {t('mealNutrients.inEntry', { name: entry.label })}
          </a>
        ) : (
          meal.length > 1 && (
            <a className="btn btn-small btn-ghost" href={href('meal', entry.id)}>
              <Icon name="bars" size={16} /> {t('mealNutrients.wholeMeal', { n: meal.length })}
            </a>
          )
        )}
        {about && (
          <a className="btn btn-small btn-ghost" href={about.to}>
            <Icon name={about.icon} size={16} /> {about.label}
          </a>
        )}
        {!ingredient && (
          <button className="btn btn-small btn-ghost" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> {t('mealNutrients.edit')}
          </button>
        )}
      </div>
      {keepRef && <FoodActions foodRef={keepRef} name={ingredient ? ingredient.label : entry.label} />}
      <ItemSource code={code} entry={entry} />
      {entry.kind === 'drink' && <p className="small notice">{t('mealNutrients.drink')}</p>}
      {parts.length > 0 && (
        <>
          <h2 className="section-title">{t('mealNutrients.ingredients', { n: parts.length })}</h2>
          <div className="card">
            <ul className="plain-list">
              {parts.map((p, i) => {
                const kcal = breakdown([{ entryId, part: i }], entries, d.model.meals, { retention }).intake.ENERCC;
                return (
                  <li key={i}>
                    <a className="entry-row" href={href('entry', entry.id, String(i))}>
                      <span className="entry-label">{p.label}</span>
                      <span className="muted small">
                        {fmtGrams(p.grams)}
                        {kcal ? ` · ${fmtAmount('ENERCC', kcal)}` : ''}
                      </span>
                      <span className="entry-edit">
                        <Icon name="chevron" size={16} />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
      {entry.kind !== 'drink' && <NutrientBreakdown b={b} weight={weight} food={code ? { code, product: isProductCode(code) ? d.productsById.get(code) : undefined } : undefined} nutrientHref={(id) => (parts.length > 0 ? href('nutrient', id, 'entry', entry.id) : href('nutrient', id))} />}
      {editing && <EditEntrySheet entry={entry} nutrientsLink={false} onClose={() => setEditing(false)} />}
    </section>
  );
}

type Order = 'type' | 'share';

/** What the page weighs the pieces at, for "per 100 g". */
export type Weight = { grams: number; raw: boolean } | undefined;

/**
 * What was eaten (default), the same per 100 g (when its weight is known) or its share of the day; the
 * energy and make-up at a glance; then every nutrient with data, grouped by type or by biggest share.
 */
function NutrientBreakdown({ b, weight, food, nutrientHref }: { b: Breakdown; weight: Weight; food?: { code: string; product?: Product }; nutrientHref: (id: string) => string }) {
  const d = useData();
  const [chosen, setBasis] = useState<Basis | SizeChoice>('serving');
  // Other amounts of the one food behind the item (its pack, a piece…), when its eaten weight is known.
  const unit = food?.product?.perMl ? 'ml' : 'g';
  const sizes = useFoodSizes(weight ? food?.code : undefined, food?.product, { taken: weight ? [weight.grams] : [] });
  const size = weight ? chosenSize(sizes, chosen) : undefined;
  const [order, setOrder] = useState<Order>('type');
  const [showEmpty, setShowEmpty] = useState(false);
  const basis: Basis = size ? 'per100' : chosen.startsWith('size:') || (chosen === 'per100' && !weight) ? 'serving' : (chosen as Basis);
  // Per 100 g proper; a size is shown the same way, scaled to its amount.
  const per100 = basis === 'per100' && !size;
  const hidden = new Set(d.settings.hiddenNutrients);
  const ids = NUTRIENTS.map((n) => n.id).filter((id) => !hidden.has(id));
  const rows = shareRows(b, ids, d.requirements, basis, weight?.grams, size?.grams);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const energy = byId.get('ENERCC');
  const eatenKcal = b.intake.ENERCC;
  const top = biggestShares(rows);
  const sorted = order === 'type' ? rows : [...rows].sort(byShare);
  // Nothing known at all (e.g. amino acids for a product whose label gives only protein): hidden unless asked for.
  const empty = rows.filter((r) => r.noData).length;
  const shown = showEmpty ? sorted : sorted.filter((r) => !r.noData);
  // The make-up is a share of the weight, so the same for the serving and for 100 g of it.
  const make = basis !== 'day' && weight ? composition(b, weight.grams) : undefined;
  const servingLabel = weight ? fmtGrams(weight.grams) : t('mealNutrients.eaten');

  return (
    <>
      <Segmented<Basis | SizeChoice>
        label={t('mealNutrients.basis')}
        className={switchClass((weight ? 2 + sizes.length : 1) + 1)}
        value={size ? chosen : basis}
        onChange={setBasis}
        options={[
          { value: 'serving', label: servingLabel },
          ...(weight ? [{ value: 'per100' as const, label: t(unit === 'ml' ? 'size.per100ml' : 'mealNutrients.per100Basis') }] : []),
          ...(weight ? sizes.map((s, i) => ({ value: sizeValue(i), label: sizeButton(s, unit) })) : []),
          { value: 'day', label: t('mealNutrients.dayBasis') },
        ]}
      />
      <div className="card meal-summary">
        {energy && (
          <p className="meal-energy">
            <strong>{amountText(energy)}</strong>
            {per100 || size ? (
              <span className="muted small">
                {' '}
                {size ? t('mealNutrients.inServing', { grams: fmtSize(size.grams, unit) }) : t('mealNutrients.per100Short')}
                {eatenKcal !== undefined && weight ? ` · ${t('mealNutrients.youHad', { grams: fmtGrams(weight.grams), kcal: fmtAmount('ENERCC', eatenKcal) })}` : ''}
              </span>
            ) : basis === 'serving' ? (
              <span className="muted small">
                {weight ? ` ${t('mealNutrients.inServing', { grams: fmtGrams(weight.grams) })}` : ''}
                {energy.share !== undefined ? ` · ${t('mealNutrients.ofEnergyRef', { pct: fmtPercent(energy.share) })}` : ''}
              </span>
            ) : (
              energy.share !== undefined && <span className="muted small"> · {t('mealNutrients.ofEnergy', { pct: fmtPercent(energy.share) })}</span>
            )}
          </p>
        )}
        {make ? (
          <MakeUp c={make} />
        ) : (
          <p className="small">
            {MACROS.map((id) => byId.get(id))
              .filter((r): r is ShareRow => !!r)
              .map((r) => `${NUTRIENT_BY_ID.get(r.id)?.short ?? r.id} ${amountText(r)}`)
              .join(' · ')}
          </p>
        )}
        {top.length > 0 && (
          <p className="small">
            {t(per100 ? 'mealNutrients.richest' : basis === 'serving' || size ? 'mealNutrients.mostServing' : 'mealNutrients.most')}:{' '}
            {top.map((r) => `${NUTRIENT_BY_ID.get(r.id)?.short ?? r.id} ${fmtPercent(r.share!)}`).join(', ')}
          </p>
        )}
        {basis === 'per100' && weight?.raw && <p className="small muted">{t('mealNutrients.rawWeight')}</p>}
        {basis === 'day' && !b.absorbedKnown && <p className="small muted">{t('mealNutrients.tooOld')}</p>}
        {!weight && basis === 'serving' && <p className="small muted">{t('mealNutrients.noWeight')}</p>}
        {b.unresolved > 0 && <p className="small notice">{t('mealNutrients.unresolved', { n: b.unresolved })}</p>}
      </div>

      <Segmented<Order>
        label={t('mealNutrients.order')}
        value={order}
        onChange={setOrder}
        options={[
          { value: 'type', label: t('mealNutrients.byType') },
          { value: 'share', label: t('mealNutrients.byShare') },
        ]}
      />
      <div className="card mrow-list">
        {shown.map((r, i) => {
          const group = nutrientType(r.id);
          const startsGroup = order === 'type' && hasGroupInfo(group) && (i === 0 || nutrientType(shown[i - 1]!.id) !== group);
          return (
            <Fragment key={r.id}>
              {startsGroup && (
                <div className="group-row-head mrow-group">
                  <span>{groupTitle(group)}</span>
                  <GroupInfoButton group={group} />
                </div>
              )}
              <ShareLine row={r} basis={size ? 'serving' : basis} sources={b.sources[r.id]} to={nutrientHref(r.id)} />
            </Fragment>
          );
        })}
        {empty > 0 && (
          <button className="btn btn-small btn-ghost" onClick={() => setShowEmpty(!showEmpty)}>
            {showEmpty ? t('mealNutrients.hideEmpty') : t('mealNutrients.showEmpty', { n: empty })}
          </button>
        )}
      </div>
      <p className="muted small">
        {size ? t('mealNutrients.legendSize', { size: fmtSize(size.grams, unit) }) : t(basis === 'serving' ? 'mealNutrients.legendServing' : per100 ? 'mealNutrients.legendPer100' : 'mealNutrients.legend')} {t('mealNutrients.legendSources')}
      </p>
    </>
  );
}

const MAKE_UP_LABEL: Record<Composition['parts'][number]['id'], MessageKey> = {
  CHO: 'mealNutrients.carbs',
  PROT625: 'mealNutrients.protein',
  FAT: 'mealNutrients.fat',
  FIBT: 'mealNutrients.fibre',
};

/** One bar of what 100 g is made of (carbs, protein, fat, fibre, the rest), with the same in words. */
function MakeUp({ c }: { c: Composition }) {
  const pct = (v: number) => (v > 0 && v < 0.005 ? '<1%' : fmtPercent(v));
  const words = c.parts.map((p) => {
    const name = t(MAKE_UP_LABEL[p.id]);
    if (p.noData) return t('mealNutrients.partNoData', { name });
    const sugar = p.id === 'CHO' && c.sugar !== undefined && c.sugar > 0 ? ` (${t('mealNutrients.ofWhichSugar', { pct: pct(c.sugar) })})` : '';
    return `${p.partial ? '≥ ' : ''}${pct(p.share)} ${name}${sugar}`;
  });
  if (c.rest !== undefined) words.push(`${pct(c.rest)} ${t('mealNutrients.rest')}`);
  return (
    <>
      <span className="makeup-bar" aria-hidden>
        {c.parts.map((p) => (
          <span key={p.id} className={`makeup-${p.id}`} style={{ width: `${p.share * 100}%` }} />
        ))}
      </span>
      <p className="small">{words.join(' · ')}</p>
    </>
  );
}

/** Biggest share first, then limits, then amounts only, then nothing known. */
function byShare(a: ShareRow, b: ShareRow): number {
  const rank = (r: ShareRow) => (r.noData ? 3 : r.kind === 'need' ? 0 : r.kind === 'limit' ? 1 : 2);
  return rank(a) - rank(b) || (b.share ?? b.amount) - (a.share ?? a.amount);
}

/** "12 mg", "≥ 12 mg" when some food has no data for it, "–" when none has. */
function amountText(r: ShareRow): string {
  if (r.noData) return '–';
  return `${r.partial ? '≥ ' : ''}${fmtAmount(r.id, r.amount)}`;
}

/** Small letters for where a value comes from (B BLS, O Open Food Facts, U USDA, E entered by you). */
function SourceMarks({ sources }: { sources?: ReadonlySet<SourceLetter> }) {
  if (!sources?.size) return null;
  const letters = SOURCE_LETTERS.filter((l) => sources.has(l));
  return (
    <span className="src-marks" aria-hidden>
      {letters.map((l) => (
        <span key={l} className="src-mark">
          {l}
        </span>
      ))}
    </span>
  );
}

/** Name with its source letters, amount, a bar for the share (full = a whole day's need or limit) and the share. */
function ShareLine({ row: r, basis, sources, to }: { row: ShareRow; basis: Basis; sources?: ReadonlySet<SourceLetter>; to: string }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const name = def?.short ?? r.id;
  const share = r.share;
  const pct = share === undefined ? '' : `${r.partial ? '≥ ' : ''}${fmtPercent(share)}`;
  const ofWhat =
    r.kind === 'limit' ? t('gauge.ofMax', { pct }) : t(basis === 'per100' ? 'mealNutrients.ofReference' : basis === 'serving' ? 'mealNutrients.ofReferenceServing' : 'mealNutrients.ofDay', { pct });
  const from = sources?.size
    ? t('mealNutrients.fromSources', {
        list: SOURCE_LETTERS.filter((l) => sources.has(l))
          .map((l) => t(`source.letter.${l}` as MessageKey))
          .join(', '),
      })
    : '';
  const spoken = [def?.name ?? r.id, amountText(r) === '–' ? t('gauge.noData') : amountText(r), pct && ofWhat, from].filter(Boolean).join(', ');
  return (
    <a className={`mrow mrow-${r.kind}`} href={to} aria-label={spoken}>
      <span className="mrow-name">
        <span className="mrow-label">{name}</span>
        <SourceMarks sources={sources} />
      </span>
      <span className="mrow-amount" aria-hidden>
        {amountText(r)}
      </span>
      {share !== undefined ? (
        <span className="nrow-bar" aria-hidden>
          <span className="nrow-fill" style={{ width: `${Math.min(1, share) * 100}%` }} />
        </span>
      ) : (
        <span aria-hidden />
      )}
      <span className="mrow-value" aria-hidden>
        {pct}
        {pct && r.kind === 'limit' && <small> {t('gauge.ofMaxShort')}</small>}
      </span>
    </a>
  );
}

/** Where an item's numbers come from, one line until opened: the database or label, with links. */
function ItemSource({ code, entry }: { code?: string; entry: LogEntry }) {
  const d = useData();
  const product = code && isProductCode(code) ? d.productsById.get(code) : undefined;
  const food = code && !product ? d.foods.byCode.get(code) : undefined;
  const batch = !code && entry.kind === 'portion' ? d.batchesById.get(entry.batchId) : undefined;
  const custom = !code && entry.kind === 'custom' ? d.customFoodsById.get(entry.customFoodId) : undefined;

  let summary: string;
  let body: ReactNode;
  if (product) {
    const match = product.match ? d.foods.byCode.get(product.match.code) : undefined;
    const own = Object.keys(product.per100)
      .map((id) => NUTRIENT_BY_ID.get(id)?.short)
      .filter((n): n is string => !!n);
    const off = product.source === 'OFF';
    const generic = hasOwnMicros(product);
    summary = t(off ? 'source.offSummary' : generic ? 'source.usdaGenericSummary' : 'source.usdaSummary') + (match ? ` + BLS` : '');
    body = (
      <>
        <p>
          <a href={productPageUrl(product)} target="_blank" rel="noreferrer">
            {t(off ? 'source.offPage' : 'source.usdaPage', { code: product.code })}
          </a>{' '}
          <span className="muted">· {t('source.fetched', { day: formatDay(dayKey(new Date(product.fetchedAt)), d.today) })}</span>
        </p>
        <p>{generic ? t('source.usdaOwn', { n: own.length }) : t('source.labelValues', { list: own.join(', ') || '–' })}</p>
        <p>
          {match ? (
            <>
              {t(generic ? 'source.gapsFrom' : 'source.restFrom')}{' '}
              {product.match?.parts ? (
                <a href={href('food', product.id)}>{pairingName(product.match, d.foods)}</a>
              ) : (
                <>
                  <a href={href('food', match.code)}>{match.nameEn}</a> <span className="muted">(BLS {match.code})</span>
                </>
              )}
              {product.match?.auto && <span className="muted"> · {t('match.autoShort')}</span>} · <a href={href('food', product.id)}>{t('off.matchChange')}</a>
            </>
          ) : (
            <>
              {t(generic ? 'source.noMatchGeneric' : 'source.noMatch')} <a href={href('food', product.id)}>{t('match.choose')}</a>
            </>
          )}
        </p>
      </>
    );
  } else if (food) {
    summary = t('source.blsSummary');
    body = (
      <>
        <p>
          {t('source.blsDetail', { code: food.code })} · {food.nameDe}
        </p>
        <p>
          <a href={href('food', food.code)}>{t('source.blsFood')}</a> ·{' '}
          <a href={BLS_URL} target="_blank" rel="noreferrer">
            {t('source.blsAbout')}
          </a>
        </p>
      </>
    );
  } else if (batch) {
    summary = t('source.recipeSummary');
    body = (
      <p>
        {t('source.recipe')} <a href={href('recipes', batch.recipeId)}>{batch.recipe.name}</a>
      </p>
    );
  } else if (custom) {
    summary = t('source.customSummary');
    body = <p>{t('source.customDetail', { name: custom.name })}</p>;
  } else if (entry.kind === 'manual') {
    summary = t('source.manualSummary');
    body = <p>{t('source.manual')}</p>;
  } else return null;

  return (
    <details className="card small item-source">
      <summary>
        <span className="muted">{t('source.title')}:</span> {summary}
      </summary>
      {body}
    </details>
  );
}
