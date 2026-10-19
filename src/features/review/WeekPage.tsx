import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { NON_SINGLE_FOOD_GROUPS } from '../../foods/foodDb';
import { diverseTop } from '../../foods/variety';
import { addDays, dayRange, parseDay } from '../../lib/dates';
import { fmtAmount, fmtNumber, fmtPercent } from '../../lib/format';
import { weekStart } from '../../lib/periods';
import { buildInsightData } from '../../logic/insights';
import { portionIntake } from '../../logic/recipeIdeas';
import { hoursMinutes } from '../../logic/sleep';
import { defaultWeek, nutrientWeeks, suggestBatch, trackerWeeks, weekPeriods, weekRecap, weeksEndingAt, WEEKS_SHOWN, type NutrientWeeks, type TrackerWeeks } from '../../logic/weekly';
import { NUTRIENT_BY_ID, NUTRIENTS } from '../../model/nutrients';
import { rankFoods } from '../../model/ranking';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Icon } from '../../ui/Icon';
import { STATUS_ICON, statusLabel, urgencyRank } from '../../ui/status';
import { DAY_ICON } from './dayStatus';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const RECAP_NAMES = 4;
const nutrientName = (id: string) => NUTRIENT_BY_ID.get(id)?.name ?? id;
const shortMonday = (day: string) => parseDay(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Weekly look-back (docs/SPEC.md, "Trends and weekly look-back"): one calendar week, what changed
 * since the week before, and every nutrient and tracker over the last weeks. Route: #/week/<monday>;
 * without a date, the current week.
 */
export function WeekPage({ week: param }: { week?: string }) {
  const d = useData();
  const thisMonday = weekStart(d.today);
  const monday = param && DAY_KEY.test(param) && param <= d.today ? weekStart(param) : defaultWeek(d.today);
  const sunday = addDays(monday, 6);
  const impute = isOn(d.settings.features, 'fillUnloggedDays');
  const hidden = useMemo(() => new Set(d.settings.hiddenNutrients), [d.settings.hiddenNutrients]);

  const weeks = useMemo(() => weeksEndingAt(monday, WEEKS_SHOWN, d.today), [monday, d.today]);
  const periods = useMemo(
    () => weekPeriods({ days: d.modelDays, sim: d.model, requirements: d.requirements, imputeUnlogged: impute }, weeks),
    [d.modelDays, d.model, d.requirements, impute, weeks],
  );
  const shown = periods[periods.length - 1]!;
  const before = periods[periods.length - 2];
  const rows = useMemo(() => nutrientWeeks(periods), [periods]);
  const recap = useMemo(() => weekRecap(rows, hidden), [rows, hidden]);

  // Sleep, activity, water and the journal live outside the model: the same day facts Insights uses.
  const journal = useLiveQuery(() => repo.db.journal.toArray(), []);
  const sleep = useLiveQuery(() => repo.db.sleep.toArray(), []);
  const activities = useLiveQuery(() => repo.db.activities.toArray(), []);
  const water = useLiveQuery(() => repo.db.water.toArray(), []);
  const f = d.settings.features;
  const trackers = useMemo(() => {
    if (!journal || !sleep || !activities || !water) return [];
    const data = buildInsightData({
      days: d.modelDays,
      daily: d.model.daily,
      dayStatus: d.model.dayStatus,
      entries: d.modelEntries,
      // Trackers the user turned off stay out, as in Insights.
      journal: isOn(f, 'journal') ? journal : [],
      sleep: isOn(f, 'sleep') ? sleep : [],
      activities: isOn(f, 'activity') ? activities : [],
      water: isOn(f, 'water') ? water : [],
      mealWindowMinutes: d.settings.mealWindowMinutes,
      today: d.today,
    });
    return trackerWeeks(data, weeks);
  }, [f, journal, sleep, activities, water, d.modelDays, d.model, d.modelEntries, d.settings.mealWindowMinutes, d.today, weeks]);

  // One suggestion for the next batch from the recipe book; without one that helps, single foods.
  const suggestion = useMemo(() => {
    if (shown.countedDays === 0) return undefined;
    const ctx = { foods: d.foods, products: d.productsById, batches: new Map(), customFoods: new Map(), salt: d.profile.salt };
    const recipe = suggestBatch(d.recipes, (r) => portionIntake(r, { ...ctx, salt: r.saltOverride ?? d.profile.salt }), shown.nutrients, d.requirements);
    if (recipe) return { kind: 'recipe' as const, ...recipe };
    const excludedGroups = new Set(d.profile.exclusions.groups);
    const excludedFoods = new Set(d.profile.exclusions.foods);
    const candidates = d.foods.foods
      .filter((f) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !excludedGroups.has(f.group) && !excludedFoods.has(f.code))
      .map((f) => ({ key: f.code, per100: f.per100 }));
    const foods = diverseTop(rankFoods(candidates, shown.nutrients, d.requirements, 40), 3, (g) => d.foods.byCode.get(g.key) ?? { code: g.key, nameEn: g.key });
    return foods.length ? { kind: 'foods' as const, foods } : undefined;
  }, [shown, d.recipes, d.foods, d.productsById, d.profile.salt, d.profile.exclusions, d.requirements]);

  const list = NUTRIENTS.filter((n) => !hidden.has(n.id))
    .map((n) => rows.get(n.id))
    .filter((r): r is NutrientWeeks => !!r)
    .sort((a, b) => urgencyRank(a.status) - urgencyRank(b.status) || (a.value ?? 0) - (b.value ?? 0));
  const enough = periods.map((p) => {
    if (p.countedDays === 0) return null;
    return NUTRIENTS.filter((n) => !hidden.has(n.id) && p.nutrients.get(n.id)?.kind !== 'info' && p.nutrients.get(n.id)?.status === 'fine').length;
  });
  const rated = NUTRIENTS.filter((n) => !hidden.has(n.id) && shown.nutrients.get(n.id)?.kind !== 'info').length;

  const title = monday === thisMonday ? t('week.thisWeek') : monday === addDays(thisMonday, -7) ? t('week.lastWeek') : `${shortMonday(monday)} – ${shortMonday(sunday)}`;
  const compare = before && before.countedDays > 0;
  // A long list would bury the rest of the recap: the first few, and how many more.
  const names = (ids: string[]) => {
    const shownNames = ids.slice(0, RECAP_NAMES).map(nutrientName).join(', ');
    return ids.length > RECAP_NAMES ? t('week.andMore', { names: shownNames, n: ids.length - RECAP_NAMES }) : shownNames;
  };

  return (
    <section>
      <header className="page-head row-between">
        <button className="icon-btn" onClick={() => navigate('week', addDays(monday, -7))} aria-label={t('week.prev')}>
          <Icon name="back" />
        </button>
        <h1>{title}</h1>
        <button className="icon-btn" disabled={monday >= thisMonday} onClick={() => navigate('week', addDays(monday, 7))} aria-label={t('week.next')}>
          <Icon name="chevron" />
        </button>
      </header>

      <ol className="week-days plain-list" aria-label={t('week.days')}>
        {dayRange(monday, sunday).map((day) => {
          const future = day > d.today;
          const st = future ? undefined : (d.model.dayStatus[day] ?? 'unknown');
          const label = parseDay(day).toLocaleDateString('en-GB', { weekday: 'short' });
          const inner = (
            <>
              <span className="small muted">{label}</span>
              <strong>{parseDay(day).getDate()}</strong>
              {st && <Icon name={DAY_ICON[st]} size={16} />}
            </>
          );
          return (
            <li key={day}>
              {future ? (
                <span className="week-day week-day-future">{inner}</span>
              ) : (
                <a className={`week-day day-${st}`} href={href('diary', day)} aria-label={`${label} ${parseDay(day).getDate()}: ${t(`day.${st}` as MessageKey)}`}>
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ol>

      <div className="card week-recap">
        <h2>{t('week.recap')}</h2>
        {shown.countedDays === 0 ? (
          <p>{t('week.noDays')}</p>
        ) : (
          <>
            <p className="muted small">{t(shown.countedDays === 1 ? 'week.countedOne' : 'week.counted', { n: shown.countedDays })}</p>
            <ul className="plain-list week-recap-list">
              {!compare && <li className="muted">{t('week.noCompare')}</li>}
              {recap.closed.length > 0 && <RecapLine icon="check" cls="week-st-fine" text={t('week.closed', { names: names(recap.closed) })} />}
              {recap.opened.length > 0 && <RecapLine icon="alert" cls="week-st-low" text={t('week.opened', { names: names(recap.opened) })} />}
              {recap.tooHigh.length > 0 && <RecapLine icon="up" cls="week-st-tooHigh" text={t('week.tooHigh', { names: names(recap.tooHigh) })} />}
              {recap.improved && <RecapLine icon="up" cls="" text={t('week.improved', { name: nutrientName(recap.improved.id), from: fmtPercent(recap.improved.from), to: fmtPercent(recap.improved.to) })} />}
              {recap.dropped && <RecapLine icon="down" cls="" text={t('week.dropped', { name: nutrientName(recap.dropped.id), from: fmtPercent(recap.dropped.from), to: fmtPercent(recap.dropped.to) })} />}
              {compare && !recap.closed.length && !recap.opened.length && !recap.improved && !recap.dropped && <li className="muted">{t('week.steady')}</li>}
            </ul>
            {suggestion?.kind === 'recipe' && (
              <a className="week-suggestion" href={href('recipes', suggestion.recipe.id)}>
                <Icon name="pot" size={18} />
                <span>
                  <strong>{t('week.cookNext', { name: suggestion.recipe.name })}</strong>
                  <span className="small muted">{t('week.portionGives', { list: suggestion.helps.map((h) => `${h.name} ${fmtPercent(h.share)}`).join(', ') })}</span>
                </span>
              </a>
            )}
            {suggestion?.kind === 'foods' && (
              <div className="week-suggestion">
                <Icon name="search" size={18} />
                <span>
                  <strong>{t('week.foodsHelp')}</strong>
                  <span className="small">
                    {suggestion.foods.map((f, i) => (
                      <span key={f.key}>
                        {i > 0 && ', '}
                        <a href={href('food', f.key)}>{d.foods.byCode.get(f.key)?.nameEn ?? f.key}</a>
                      </span>
                    ))}
                  </span>
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>{t('week.enoughTitle', { n: rated })}</h2>
        <WeekChart weeks={weeks.map((w) => w.from)} values={enough} max={rated} onPick={(w) => navigate('week', w)} current={monday} />
      </div>

      <h2 className="week-section">{t('week.nutrients')}</h2>
      <p className="muted small">{t('week.nutrientsHint', { n: WEEKS_SHOWN })}</p>
      <ul className="plain-list week-rows">
        {list.map((r) => (
          <li key={r.id}>
            <NutrientRow row={r} />
          </li>
        ))}
      </ul>

      {trackers.length > 0 && (
        <>
          <h2 className="week-section">{t('week.trackers')}</h2>
          <ul className="plain-list week-rows">
            {trackers.map((tr) => (
              <li key={tr.id}>
                <TrackerRow row={tr} />
              </li>
            ))}
          </ul>
        </>
      )}

      <a className="btn btn-secondary btn-block week-review" href={href('review', monday, sunday > d.today ? d.today : sunday)}>
        <Icon name="bars" size={18} /> {t('week.allNumbers')}
      </a>
      <p className="muted small disclaimer">{t(impute ? 'week.explainFilled' : 'week.explain')}</p>
    </section>
  );
}

function RecapLine({ icon, cls, text }: { icon: string; cls: string; text: string }) {
  return (
    <li className={`week-recap-line ${cls}`}>
      <Icon name={icon} size={16} />
      <span>{text}</span>
    </li>
  );
}

function valueText(r: NutrientWeeks, v: number | null): string {
  if (v === null) return '–';
  if (r.kind === 'info') return fmtAmount(r.id, v);
  if (r.kind === 'limit') return t('gauge.ofMax', { pct: fmtPercent(v) });
  return fmtPercent(v);
}

function NutrientRow({ row: r }: { row: NutrientWeeks }) {
  const name = NUTRIENT_BY_ID.get(r.id)?.short ?? r.id;
  const value = valueText(r, r.value);
  const status = r.value === null ? 'unknown' : r.status;
  return (
    <button
      className={`week-row week-st-${status}`}
      onClick={() => navigate('nutrient', r.id)}
      aria-label={`${NUTRIENT_BY_ID.get(r.id)?.name ?? r.id}: ${value}, ${statusLabel(status)}${r.prev !== null ? `, ${t('week.lastWeekValue', { v: valueText(r, r.prev) })}` : ''}`}
    >
      <Icon name={STATUS_ICON[status]} size={14} />
      <span className="week-row-name">{name}</span>
      <MiniBars values={r.series} target={r.kind === 'info' ? undefined : 1} />
      <span className="week-row-value">{value}</span>
    </button>
  );
}

const CLOCK = new Set(['bedtime', 'wake_time', 'first_meal', 'last_meal']);

function trackerValue(id: string, v: number | null): string {
  if (v === null) return '–';
  if (CLOCK.has(id)) {
    const minutes = Math.round((v % 24) * 60);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  if (id === 'sleep_hours') {
    const { h, m } = hoursMinutes(v * 3_600_000);
    return t('week.hm', { h, m });
  }
  if (id.endsWith('_minutes')) {
    const { h, m } = hoursMinutes(v * 60_000);
    return h ? t('week.hm', { h, m }) : t('week.min', { m });
  }
  if (id.endsWith('water')) return t('week.litres', { v: fmtNumber(v / 1000, 1) });
  if (id === 'alcohol') return t('week.grams', { v: fmtNumber(v, v < 10 ? 1 : 0) });
  return fmtNumber(v);
}

function TrackerRow({ row: r }: { row: TrackerWeeks }) {
  const label = t(`week.tr.${r.id}` as MessageKey);
  const value = trackerValue(r.id, r.value);
  return (
    <div className="week-row week-row-tracker" role="group" aria-label={`${label}: ${value}`}>
      <span className="week-row-name">
        {label}
        {r.prev !== null && <span className="small muted week-row-prev">{t('week.lastWeekValue', { v: trackerValue(r.id, r.prev) })}</span>}
      </span>
      {/* Clock times have no zero to draw bars from. */}
      {!CLOCK.has(r.id) && <MiniBars values={r.series} />}
      <span className="week-row-value">{value}</span>
    </div>
  );
}

/** One small bar per week, the shown week last and highlighted; a dashed line at the need (1 = 100 %). */
function MiniBars({ values, target }: { values: Array<number | null>; target?: number }) {
  const W = 64;
  const H = 22;
  const n = values.length;
  const gap = 2;
  const bw = (W - gap * (n - 1)) / n;
  const top = Math.max(target ? target * 1.5 : 0, ...values.map((v) => v ?? 0)) || 1;
  const y = (v: number) => H - (Math.min(v, top) / top) * H;
  return (
    <svg className="minibars" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      {values.map((v, i) => {
        const x = i * (bw + gap);
        if (v === null) return <rect key={i} x={x} y={H - 1} width={bw} height={1} className="minibar-none" />;
        const h = Math.max(1, H - y(v));
        return <rect key={i} x={x} y={H - h} width={bw} height={h} rx={1} className={i === n - 1 ? 'minibar minibar-current' : 'minibar'} />;
      })}
      {target !== undefined && <line x1={0} x2={W} y1={y(target)} y2={y(target)} className="minibar-target" />}
    </svg>
  );
}

/** Nutrients at "enough" per week: one bar per week with its count written on it, tap a week to open it. */
function WeekChart({ weeks, values, max, current, onPick }: { weeks: string[]; values: Array<number | null>; max: number; current: string; onPick: (week: string) => void }) {
  return (
    <ol className="week-chart plain-list">
      {weeks.map((w, i) => {
        const v = values[i] ?? null;
        const pct = v === null || !max ? 0 : (v / max) * 100;
        return (
          <li key={w}>
            <button className={`week-chart-col${w === current ? ' is-current' : ''}`} onClick={() => onPick(w)} aria-label={`${shortMonday(w)}: ${v === null ? t('week.noData') : t('week.enoughOf', { n: v, of: max })}`}>
              <span className="week-chart-num small">{v === null ? '–' : v}</span>
              <span className="week-chart-track">
                <span className="week-chart-bar" style={{ height: `${pct}%` }} />
              </span>
              {/* Day of the Monday, and the month where it changes, so eight labels fit a phone. */}
              <span className="week-chart-label">
                {parseDay(w).getDate()}
                <br />
                {i === 0 || w.slice(5, 7) !== weeks[i - 1]!.slice(5, 7) ? parseDay(w).toLocaleDateString('en-GB', { month: 'short' }) : '\u00a0'}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
