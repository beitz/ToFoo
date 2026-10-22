import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { NON_SINGLE_FOOD_GROUPS } from '../../foods/foodDb';
import { diverseTop } from '../../foods/variety';
import { addDays, dayRange, formatDate, parseDay, weekdayShort } from '../../lib/dates';
import { fmtAmount, fmtNumber, fmtPercent } from '../../lib/format';
import { weekStart } from '../../lib/periods';
import { buildInsightData } from '../../logic/insights';
import { portionIntake } from '../../logic/recipeIdeas';
import { hoursMinutes } from '../../logic/sleep';
import {
  defaultWeek,
  isoWeek,
  nutrientWeeks,
  suggestBatch,
  trackerWeeks,
  weekMoves,
  weekPeriods,
  weekRecap,
  weeksEndingAt,
  weekWatch,
  WEEKS_SHOWN,
  type NutrientWeeks,
  type TrackerWeeks,
  type WeekMove,
} from '../../logic/weekly';
import { NUTRIENT_BY_ID, NUTRIENTS } from '../../model/nutrients';
import { rankFoods } from '../../model/ranking';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Icon } from '../../ui/Icon';
import { AskChips } from '../../ui/AskChips';
import { STATUS_ICON, statusLabel, urgencyRank } from '../../ui/status';
import { StatusMark, symbolOf } from '../../ui/Tile';
import type { DayStatus } from '../../model/types';
import { RecipeToListSheet } from '../shopping/RecipeToListSheet';
import { InsightsTabs } from './InsightsTabs';
import { DAY_ICON } from './dayStatus';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const RECAP_NAMES = 4;
const nutrientName = (id: string) => NUTRIENT_BY_ID.get(id)?.name ?? id;
const shortMonday = (day: string) => formatDate(day, false);
/** "Mon 19.10. – Sun 25.10." */
const weekRange = (monday: string, sunday: string) => `${weekdayShort(monday)} ${formatDate(monday, false)} – ${weekdayShort(sunday)} ${formatDate(sunday, false)}`;

/**
 * Weekly look-back (docs/SPEC.md, "Trends and weekly look-back"; design 2026-10-22, "A week"): the
 * days with their energy, what got better and worse since the week before, small charts of what
 * needs watching, one suggestion for the next batch, and every nutrient and tracker in folds.
 * Route: #/week/<monday>; without a date, the current week.
 */
export function WeekPage({ week: param }: { week?: string }) {
  const d = useData();
  const thisMonday = weekStart(d.today);
  const monday = param && DAY_KEY.test(param) && param <= d.today ? weekStart(param) : defaultWeek(d.today);
  const sunday = addDays(monday, 6);
  const impute = isOn(d.settings.features, 'fillUnloggedDays');
  const hidden = useMemo(() => new Set(d.settings.hiddenNutrients), [d.settings.hiddenNutrients]);
  const [toList, setToList] = useState(false);

  const weeks = useMemo(() => weeksEndingAt(monday, WEEKS_SHOWN, d.today), [monday, d.today]);
  const periods = useMemo(() => weekPeriods({ days: d.modelDays, sim: d.model, requirements: d.requirements, imputeUnlogged: impute }, weeks), [d.modelDays, d.model, d.requirements, impute, weeks]);
  const shown = periods[periods.length - 1]!;
  const before = periods[periods.length - 2];
  const rows = useMemo(() => nutrientWeeks(periods), [periods]);
  const recap = useMemo(() => weekRecap(rows, hidden), [rows, hidden]);
  const moves = useMemo(() => weekMoves(rows, hidden), [rows, hidden]);
  const watch = useMemo(() => weekWatch(rows, moves.worse, hidden), [rows, moves.worse, hidden]);

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
    const candidates = d.foods.foods.filter((f) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !excludedGroups.has(f.group) && !excludedFoods.has(f.code)).map((f) => ({ key: f.code, per100: f.per100 }));
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

  const compare = !!before && before.countedDays > 0;
  const range = weekRange(monday, sunday);
  // A long list would bury the rest: the first few, and how many more.
  const names = (ids: string[]) => {
    const shownNames = ids.slice(0, RECAP_NAMES).map(nutrientName).join(', ');
    return ids.length > RECAP_NAMES ? t('week.andMore', { names: shownNames, n: ids.length - RECAP_NAMES }) : shownNames;
  };

  return (
    <section>
      <InsightsTabs view="week" day={monday} />
      <header className="week-head">
        <div className="grow">
          <h1>{t('week.number', { n: isoWeek(monday) })}</h1>
          <p className="muted small">
            {monday === thisMonday ? `${t('week.thisWeek')} · ` : monday === addDays(thisMonday, -7) ? `${t('week.lastWeek')} · ` : ''}
            {range}
            {compare ? ` · ${t('week.comparedWith', { n: isoWeek(addDays(monday, -7)) })}` : ''}
          </p>
        </div>
        <button className="icon-btn round-btn" onClick={() => navigate('week', addDays(monday, -7))} aria-label={t('week.prev')}>
          <Icon name="back" />
        </button>
        <button className="icon-btn round-btn" disabled={monday >= thisMonday} onClick={() => navigate('week', addDays(monday, 7))} aria-label={t('week.next')}>
          <Icon name="chevron" />
        </button>
      </header>

      <DaysCard monday={monday} />

      {shown.countedDays === 0 ? (
        <p className="card muted">{t('week.noDays')}</p>
      ) : !compare ? (
        <p className="card muted small">{t('week.noCompare')}</p>
      ) : (
        <>
          <MovesCard title={t('week.better')} moves={moves.better} empty={t('week.noBetter')} note={recap.closed.length ? t('week.closed', { names: names(recap.closed) }) : undefined} />
          <MovesCard
            title={t('week.worse')}
            moves={moves.worse}
            empty={t('week.noWorse')}
            note={
              [recap.opened.length ? t('week.opened', { names: names(recap.opened) }) : '', recap.tooHigh.length ? t('week.tooHigh', { names: names(recap.tooHigh) }) : '']
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
        </>
      )}

      {watch.length > 0 && <WatchCard ids={watch} rows={rows} weeks={weeks.map((w) => w.from)} />}

      {suggestion?.kind === 'recipe' && (
        <div className="card week-batch">
          <p className="muted small">{t('week.nextBatch')}</p>
          <h2>{suggestion.recipe.name}</h2>
          <p className="small">{t('week.portionGives', { list: suggestion.helps.map((h) => `${h.name} ${fmtPercent(h.share)}`).join(', ') })}</p>
          <div className="week-batch-actions">
            <a className="btn btn-primary" href={href('recipes', suggestion.recipe.id)}>
              {t('week.openRecipe')}
            </a>
            {isOn(f, 'shoppingList') && (
              <button type="button" className="btn btn-secondary" onClick={() => setToList(true)}>
                <Icon name="cart" size={16} /> {t('week.toBasket')}
              </button>
            )}
          </div>
        </div>
      )}
      {suggestion?.kind === 'foods' && (
        <div className="card week-batch">
          <p className="muted small">{t('week.foodsHelp')}</p>
          <ul className="plain-list week-foods">
            {suggestion.foods.map((fd) => (
              <li key={fd.key}>
                <a className="week-link" href={href('food', fd.key)}>
                  <span className="grow">{d.foods.byCode.get(fd.key)?.nameEn ?? fd.key}</span>
                  <Icon name="chevron" size={16} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {toList && suggestion?.kind === 'recipe' && <RecipeToListSheet recipe={suggestion.recipe} onClose={() => setToList(false)} />}

      <AskChips questions={[t('week.ask')]} />

      <details className="card fold week-fold">
        <summary>
          <Icon name="bars" size={18} /> <span className="grow">{t('week.allNutrients', { n: list.length })}</span>
          <Icon name="down" size={18} />
        </summary>
        <h3>{t('week.enoughTitle', { n: rated })}</h3>
        <WeekChart weeks={weeks.map((w) => w.from)} values={enough} max={rated} onPick={(w) => navigate('week', w)} current={monday} />
        <p className="muted small">{t('week.nutrientsHint', { n: WEEKS_SHOWN })}</p>
        <ul className="plain-list week-rows">
          {list.map((r) => (
            <li key={r.id}>
              <NutrientRow row={r} />
            </li>
          ))}
        </ul>
      </details>

      {trackers.length > 0 && (
        <details className="card fold week-fold">
          <summary>
            <Icon name="moon" size={18} /> <span className="grow">{t('week.trackers')}</span>
            <Icon name="down" size={18} />
          </summary>
          <ul className="plain-list week-rows">
            {trackers.map((tr) => (
              <li key={tr.id}>
                <TrackerRow row={tr} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {isOn(f, 'sleep') && (
        <a className="card week-link" href={href('nights')}>
          <Icon name="moon" size={18} />
          <span className="grow">{t('week.sleepPage')}</span>
          <Icon name="chevron" size={16} />
        </a>
      )}

      <a className="btn btn-secondary btn-block week-review" href={href('review', monday, sunday > d.today ? d.today : sunday)}>
        <Icon name="bars" size={18} /> {t('week.allNumbers')}
      </a>
      <p className="muted small disclaimer">{t(impute ? 'week.explainFilled' : 'week.explain')}</p>
    </section>
  );
}

/** Energy per day against the target, with how each day was logged; tap a day to open it. */
function DaysCard({ monday }: { monday: string }) {
  const d = useData();
  const target = d.requirements.byNutrient.get('ENERCC')?.recommended;
  const days = dayRange(monday, addDays(monday, 6)).map((day) => {
    const i = d.modelDays.indexOf(day);
    const status: DayStatus | 'pending' | 'future' = day > d.today ? 'future' : day === d.today ? 'pending' : (d.model.dayStatus[day] ?? 'unknown');
    const kcal = i >= 0 && status !== 'future' ? d.model.daily[i]?.intake.ENERCC : undefined;
    return { day, status, kcal: kcal && kcal > 0 ? kcal : undefined };
  });
  const top = Math.max((target ?? 0) * 1.25, ...days.map((x) => x.kcal ?? 0)) || 1;
  return (
    <div className="card">
      <div className="card-head">
        <h2>{t('week.theDays')}</h2>
        <span className="card-note">{target ? t('week.energyNote', { kcal: fmtNumber(target) }) : t('week.energy')}</span>
      </div>
      <ol className="plain-list week-energy" aria-label={t('week.days')}>
        {days.map(({ day, status, kcal }) => {
          const date = parseDay(day);
          const top10 = (v: number) => `${(v / top) * 100}%`;
          const label = status === 'fasted' ? t('week.fast') : kcal ? kcalShort(kcal) : status === 'future' ? '' : '–';
          const statusText = status === 'future' ? '' : t(`day.${status}` as MessageKey);
          const inner = (
            <>
              <span className="week-energy-num small" aria-hidden>
                {label}
              </span>
              <span className="week-energy-track" aria-hidden>
                {target && <span className="week-energy-target" style={{ bottom: top10(target) }} />}
                {kcal && <span className={`week-energy-bar${status === 'pending' ? ' is-today' : ''}`} style={{ height: top10(kcal) }} />}
              </span>
              {status !== 'future' && (
                <span className={`week-energy-mark day-${status}`} aria-hidden>
                  <Icon name={DAY_ICON[status]} size={12} />
                </span>
              )}
              <span className="week-energy-wd" aria-hidden>
                {date.toLocaleDateString('en-GB', { weekday: 'narrow' })}
              </span>
            </>
          );
          return (
            <li key={day}>
              {status === 'future' ? (
                <span className="week-energy-col is-future">{inner}</span>
              ) : (
                <a className="week-energy-col" href={href('diary', day)} aria-label={`${weekdayShort(day)} ${formatDate(day, false)}: ${statusText}${kcal ? `, ${fmtAmount('ENERCC', kcal)}` : ''}`}>
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 1 480 kcal as "1.5k", so seven fit a phone. */
const kcalShort = (kcal: number) => (kcal >= 1000 ? `${fmtNumber(kcal / 1000, 1)}k` : fmtNumber(kcal));

/** Got better / Got worse: each nutrient's week before and this week on one line, tap to open. */
function MovesCard({ title, moves, empty, note }: { title: string; moves: WeekMove[]; empty: string; note?: string }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="card-note">{t('week.lastToThis')}</span>
      </div>
      {moves.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul className="plain-list week-moves">
          {moves.map((m) => (
            <li key={m.id}>
              <MoveRow move={m} />
            </li>
          ))}
        </ul>
      )}
      {note && <p className="muted small week-moves-note">{note}</p>}
    </div>
  );
}

/** How far the move bar reaches: one and a half times the need or maximum. */
const MOVE_TOP = 1.5;

function MoveRow({ move: m }: { move: WeekMove }) {
  const pos = (v: number) => `${(Math.min(v, MOVE_TOP) / MOVE_TOP) * 100}%`;
  const lo = Math.min(m.from, m.to);
  const hi = Math.max(m.from, m.to);
  const name = nutrientName(m.id);
  const from = fmtPercent(m.from);
  const to = fmtPercent(m.to);
  return (
    <button
      type="button"
      className={`week-move ${m.change > 0 ? 'is-better' : 'is-worse'} week-move-${m.kind}`}
      onClick={() => navigate('nutrient', m.id)}
      aria-label={t(m.kind === 'limit' ? 'week.moveLimitSpoken' : 'week.moveSpoken', { name, from, to })}
    >
      <span className="week-move-name" aria-hidden>
        {symbolOf(m.id)}
      </span>
      <span className="week-move-track" aria-hidden>
        {m.kind === 'limit' && <span className="week-move-over" style={{ left: pos(1) }} />}
        <span className="week-move-span" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
        <span className="week-move-need" style={{ left: pos(1) }} />
        <span className="week-move-was" style={{ left: pos(m.from) }} />
        <span className="week-move-now" style={{ left: pos(m.to) }}>
          <Icon name={m.to > m.from ? 'up' : 'down'} size={12} />
        </span>
      </span>
      <span className="week-move-value" aria-hidden>
        <span className="muted">{from}</span> → <strong>{to}</strong>
      </span>
    </button>
  );
}

/** "8 weeks": a small chart per nutrient worth watching, the dashed line at the need or maximum. */
function WatchCard({ ids, rows, weeks }: { ids: string[]; rows: ReadonlyMap<string, NutrientWeeks>; weeks: string[] }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>{t('week.weeksTitle', { n: weeks.length })}</h2>
        <span className="card-note">{t('week.tapToOpen')}</span>
      </div>
      <div className="week-watch">
        {ids.map((id) => {
          const r = rows.get(id)!;
          const value = valueText(r, r.value);
          return (
            <button key={id} type="button" className={`week-spark week-st-${r.status}`} onClick={() => navigate('nutrient', id)} aria-label={`${nutrientName(id)}: ${value}, ${statusLabel(r.status)}`}>
              <span className="week-spark-head" aria-hidden>
                <span className="week-spark-name">{NUTRIENT_BY_ID.get(id)?.short ?? id}</span>
                <StatusMark status={r.status} size={10} />
                <span className="week-spark-value">{r.value === null ? '–' : fmtPercent(r.value)}</span>
              </span>
              <Spark values={r.series} />
              <span className="week-spark-unit small muted" aria-hidden>
                {t(r.kind === 'limit' ? 'week.ofMax' : 'week.ofNeed')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A week-by-week line, gaps where a week had no counted day, the dashed line at 100 %. */
function Spark({ values }: { values: Array<number | null> }) {
  const W = 140;
  const H = 34;
  const top = Math.max(1.3, ...values.map((v) => v ?? 0));
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * W : W / 2);
  const y = (v: number) => H - 2 - (Math.min(v, top) / top) * (H - 4);
  let path = '';
  values.forEach((v, i) => {
    if (v === null) return;
    path += `${i && values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const last = values.length - 1;
  const lastV = values[last];
  return (
    <svg className="week-spark-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <line x1={0} x2={W} y1={y(1)} y2={y(1)} className="week-spark-need" />
      <path d={path} className="week-spark-line" />
      {lastV !== null && lastV !== undefined && <circle cx={x(last)} cy={y(lastV)} r={2.5} className="week-spark-dot" />}
    </svg>
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
            <button
              className={`week-chart-col${w === current ? ' is-current' : ''}`}
              onClick={() => onPick(w)}
              aria-label={`${shortMonday(w)}: ${v === null ? t('week.noData') : t('week.enoughOf', { n: v, of: max })}`}
            >
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
