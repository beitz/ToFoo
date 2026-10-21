import { Fragment, useMemo, useState } from 'react';
import { useData, type AppData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { formatDay, formatTime } from '../../lib/dates';
import { fmtAmount, fmtGrams, fmtPercent } from '../../lib/format';
import { biggestShares, breakdown, shareRows, type Piece, type ShareRow } from '../../logic/mealNutrients';
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

const MACROS = ['PROT625', 'FAT', 'CHO', 'FIBT'];

/** The diary's meal (same grouping) that holds this entry. */
function mealOf(d: AppData, entry: LogEntry): LogEntry[] {
  const meals = groupMeals(
    d.log.filter((e) => e.day === entry.day),
    d.settings.mealWindowMinutes,
  );
  return meals.find((m) => m.some((e) => e.id === entry.id)) ?? [entry];
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
      <button className="icon-btn" onClick={() => history.back()} aria-label={t('common.back')}>
        <Icon name="back" />
      </button>
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
      <NutrientBreakdown b={b} />
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
  const foodCode = ingredient ? undefined : entry.kind === 'food' && entry.ref.source === 'BLS' ? entry.ref.code : undefined;
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
        {foodCode && (
          <a className="btn btn-small btn-ghost" href={href('food', foodCode)}>
            <Icon name="search" size={16} /> {t('mealNutrients.per100')}
          </a>
        )}
        {!ingredient && (
          <button className="btn btn-small btn-ghost" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> {t('mealNutrients.edit')}
          </button>
        )}
      </div>
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
      {entry.kind !== 'drink' && <NutrientBreakdown b={b} />}
      {editing && <EditEntrySheet entry={entry} nutrientsLink={false} onClose={() => setEditing(false)} />}
    </section>
  );
}

type Order = 'type' | 'share';

/** Energy and macros at a glance, the nutrients it covers most of, then every nutrient with its share of the day. */
function NutrientBreakdown({ b }: { b: ReturnType<typeof breakdown> }) {
  const d = useData();
  const [order, setOrder] = useState<Order>('type');
  const hidden = new Set(d.settings.hiddenNutrients);
  const ids = NUTRIENTS.map((n) => n.id).filter((id) => !hidden.has(id));
  const rows = shareRows(b, ids, d.requirements);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const energy = byId.get('ENERCC');
  const top = biggestShares(rows);
  const sorted = order === 'type' ? rows : [...rows].sort(byShare);

  return (
    <>
      <div className="card meal-summary">
        {energy && (
          <p className="meal-energy">
            <strong>{amountText(energy)}</strong>
            {energy.share !== undefined && <span className="muted small"> · {t('mealNutrients.ofEnergy', { pct: fmtPercent(energy.share) })}</span>}
          </p>
        )}
        <p className="small">
          {MACROS.map((id) => byId.get(id))
            .filter((r): r is ShareRow => !!r)
            .map((r) => `${NUTRIENT_BY_ID.get(r.id)?.short ?? r.id} ${amountText(r)}`)
            .join(' · ')}
        </p>
        {top.length > 0 && (
          <p className="small">
            {t('mealNutrients.most')}: {top.map((r) => `${NUTRIENT_BY_ID.get(r.id)?.short ?? r.id} ${fmtPercent(r.share!)}`).join(', ')}
          </p>
        )}
        {!b.absorbedKnown && <p className="small muted">{t('mealNutrients.tooOld')}</p>}
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
        {sorted.map((r, i) => {
          const group = nutrientType(r.id);
          const startsGroup = order === 'type' && hasGroupInfo(group) && (i === 0 || nutrientType(sorted[i - 1]!.id) !== group);
          return (
            <Fragment key={r.id}>
              {startsGroup && (
                <div className="group-row-head mrow-group">
                  <span>{groupTitle(group)}</span>
                  <GroupInfoButton group={group} />
                </div>
              )}
              <ShareLine row={r} />
            </Fragment>
          );
        })}
      </div>
      <p className="muted small">{t('mealNutrients.legend')}</p>
    </>
  );
}

/** Biggest share of the need first, then limits, then amounts only, then nothing known. */
function byShare(a: ShareRow, b: ShareRow): number {
  const rank = (r: ShareRow) => (r.noData ? 3 : r.kind === 'need' ? 0 : r.kind === 'limit' ? 1 : 2);
  return rank(a) - rank(b) || (b.share ?? b.amount) - (a.share ?? a.amount);
}

/** "12 mg", "≥ 12 mg" when some food has no data for it, "–" when none has. */
function amountText(r: ShareRow): string {
  if (r.noData) return '–';
  return `${r.partial ? '≥ ' : ''}${fmtAmount(r.id, r.amount)}`;
}

/** Name, amount, a bar for the share of the day (full = the whole day's need or limit) and the share. */
function ShareLine({ row: r }: { row: ShareRow }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const name = def?.short ?? r.id;
  const share = r.share;
  const pct = share === undefined ? '' : `${r.partial ? '≥ ' : ''}${fmtPercent(share)}`;
  const spoken = [def?.name ?? r.id, amountText(r) === '–' ? t('gauge.noData') : amountText(r), pct && (r.kind === 'limit' ? t('gauge.ofMax', { pct }) : t('mealNutrients.ofDay', { pct }))]
    .filter(Boolean)
    .join(', ');
  return (
    <a className={`mrow mrow-${r.kind}`} href={href('nutrient', r.id)} aria-label={spoken}>
      <span className="mrow-name">{name}</span>
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
