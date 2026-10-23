import { useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays, formatDay } from '../../lib/dates';
import { fmtAmount } from '../../lib/format';
import { dayLayers, type Layer, type Mark } from '../../logic/calendarLayers';
import { fastClock, fastEnd } from '../../logic/fasting';
import { nightsWindow, sleepDebt } from '../../logic/nights';
import { activitySummary, pastFasts, perDay, statusTally, waterSummary, windowDays } from '../../logic/trackers';
import { dayWater, waterTarget } from '../../logic/water';
import { defaultWeek, isoWeek, nutrientWeeks, weekMoves, weekPeriods, weeksEndingAt } from '../../logic/weekly';
import { periodBreakdown } from '../../model/period';
import type { GaugeStatus } from '../../model/simulate';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Icon } from '../../ui/Icon';
import { STATUS_ICON, statusLabel } from '../../ui/status';
import { activityName } from '../activity/ActivityForm';
import { useSkipped } from '../catchup/useCatchUp';
import { fmtFastDuration } from '../fast/useFast';
import { useJournal } from '../journal/useJournal';
import { useSleepNeed } from '../settings/SleepNeed';
import { hmText } from '../sleep/format';
import { useSleep } from '../sleep/useSleep';
import { waterText } from '../water/format';
import { InsightsTabs } from './InsightsTabs';
import { LevelsSummary } from './LevelsSummary';

const STRIP_DAYS = 7;
const TALLY: GaugeStatus[] = ['low', 'gettingLow', 'fine', 'tooHigh'];
const SNIPPET = 40;

/**
 * #/overview, the first screen of Insights (owner's pick, 2026-10-23: "show what is available and get
 * to it quickly"): one row per thing tracked, each with its last-7-days number and a strip of dots
 * (filled = logged, ring = forgotten), tapping through to its page. Trackers that are off stay out.
 */
export function OverviewPage() {
  const d = useData();
  const f = d.settings.features;
  const sleep = useSleep();
  const water = useLiveQuery(() => repo.db.water.toArray(), []);
  const journal = useJournal();
  const skipped = useSkipped();
  const need = useSleepNeed();
  const hidden = useMemo(() => new Set(d.settings.hiddenNutrients), [d.settings.hiddenNutrients]);
  const impute = isOn(f, 'fillUnloggedDays');
  const days = useMemo(() => windowDays(d.today, STRIP_DAYS), [d.today]);
  // Nutrients over the last 7 finished days: today is not over, as on Home.
  const finished = useMemo(() => windowDays(addDays(d.today, -1), STRIP_DAYS), [d.today]);

  const week = useMemo(() => {
    const monday = defaultWeek(d.today);
    const periods = weekPeriods({ days: d.modelDays, sim: d.model, requirements: d.requirements, imputeUnlogged: impute }, weeksEndingAt(monday, 2, d.today));
    const moves = weekMoves(nutrientWeeks(periods), hidden, Infinity);
    return { monday, counted: periods[1]!.countedDays, compare: periods[0]!.countedDays > 0, better: moves.better.length, worse: moves.worse.length };
  }, [d.today, d.modelDays, d.model, d.requirements, impute, hidden]);

  const nutrients = useMemo(() => {
    const p = periodBreakdown({ days: d.modelDays, sim: d.model, requirements: d.requirements, imputeUnlogged: impute, from: finished[0]!, to: finished[finished.length - 1]! });
    return { counted: p.countedDays, tally: statusTally(p.nutrients, hidden), kcal: p.nutrients.get('ENERCC')?.averageIntake };
  }, [d.modelDays, d.model, d.requirements, impute, finished, hidden]);

  const layers = useMemo(
    () => (sleep && water && journal && skipped ? dayLayers({ days, today: d.today, dayStatus: d.model.dayStatus, sleep, activities: d.activities, water, journal, skipped }) : undefined),
    [days, d.today, d.model.dayStatus, sleep, d.activities, water, journal, skipped],
  );

  const fast = useMemo(() => {
    const items = d.fasts.map((x) => {
      const clock = fastClock(x, d.log, d.customFoodsById, d.settings.mealWindowMinutes);
      return { id: x.id, startDay: x.startDay, since: clock.since, end: fastEnd(x, clock, d.log, d.customFoodsById), fromMeal: clock.fromMeal };
    });
    return pastFasts(items, Date.now())[0];
  }, [d.fasts, d.log, d.customFoodsById, d.settings.mealWindowMinutes]);

  if (!sleep || !water || !journal || !layers) return null;
  const strip = (layer: Layer) => <Strip marks={days.map((day) => layers.get(day)?.marks[layer] ?? 'none')} layer={layer} />;

  // Sleep: the last 7 nights against the need.
  const nights = sleepDebt(nightsWindow(sleep, d.today, STRIP_DAYS, need.minutes));
  // Activity and water: the last 7 days, today included (it counts once something is logged).
  const act = activitySummary(d.activities, days);
  const target = waterTarget(d.requirements.ageGroup);
  const plain = perDay(water, days, (r) => r.ml);
  const wat = waterSummary(new Map([...plain.keys()].map((day) => [day, dayWater(day, d.modelEntries, water).totalMl])), target);
  const notes = journal.filter((j) => j.day >= days[0]!);
  const latest = notes[notes.length - 1];
  const off = (['sleep', 'activity', 'water', 'journal'] as const).filter((k) => !isOn(f, k));
  const offNames = [...(isOn(f, 'fasting') ? [] : [t('overview.fasting')]), ...off.map((k) => t(OFF_NAME[k]))];

  return (
    <section>
      <InsightsTabs view="overview" day={d.today} />

      <div className="card ov-card">
        <Row to={href('week', week.monday)} icon="history" title={t('overview.week', { n: isoWeek(week.monday) })}>
          {week.counted === 0
            ? t('overview.nothingYet')
            : week.compare
              ? t('overview.weekMoves', { better: week.better, worse: week.worse })
              : t('overview.weekFirst')}
        </Row>
        <Row to={href('review', finished[0]!, finished[finished.length - 1]!)} icon="bars" title={t('overview.nutrients')} strip={strip('meals')}>
          {nutrients.counted === 0 ? (
            t('overview.nothingDays')
          ) : (
            <>
              <Tally tally={nutrients.tally} />
              {nutrients.kcal !== undefined && <span className="ov-kcal">{t('overview.perDay', { amount: fmtAmount('ENERCC', nutrients.kcal) })}</span>}
            </>
          )}
        </Row>
        {(isOn(f, 'fasting') || fast?.running) && (
          <Row to={href('fasting')} icon="hourglass" title={t('overview.fasting')}>
            {!fast
              ? t('overview.noFasts')
              : fast.running
                ? t('overview.fastRunning', { d: fmtFastDuration(fast.hours) })
                : t('overview.fastLast', { d: `${fast.fromMeal ? '' : '≥ '}${fmtFastDuration(fast.hours)}`, day: formatDay(fast.startDay, d.today) })}
          </Row>
        )}
      </div>

      {off.length < 4 && (
        <div className="card ov-card">
          {isOn(f, 'sleep') && (
            <Row to={href('nights')} icon="bed" title={t('nights.title')} strip={strip('sleep')}>
              {nights.average === undefined
                ? t('overview.nothingDays')
                : t(nights.lastWeek < 0 ? 'overview.sleepShort' : 'overview.sleepOver', { avg: hmText(nights.average), diff: hmText(Math.abs(nights.lastWeek)) })}
            </Row>
          )}
          {isOn(f, 'activity') && (
            <Row to={href('activity')} icon="activity" title={t('activity.short')} strip={strip('activity')}>
              {act.loggedDays === 0
                ? t('overview.nothingDays')
                : act.top[0]
                  ? t('overview.activity', { total: hmText(act.totalMinutes), top: activityName(act.top[0]) })
                  : hmText(act.totalMinutes)}
            </Row>
          )}
          {isOn(f, 'water') && (
            <Row to={href('water')} icon="drop" title={t('water.title')} strip={strip('water')}>
              {wat.averageMl === undefined ? t('overview.nothingDays') : t('overview.water', { avg: waterText(wat.averageMl), n: wat.daysAtTarget, target: waterText(target) })}
            </Row>
          )}
          {isOn(f, 'journal') && (
            <Row to={href('journal')} icon="journal" title={t('journal.title')} strip={strip('journal')}>
              {!latest
                ? t('overview.nothingDays')
                : t('overview.journal', { n: notes.length, text: latest.text.length > SNIPPET ? `${latest.text.slice(0, SNIPPET).trimEnd()}…` : latest.text })}
            </Row>
          )}
        </div>
      )}

      <LevelsSummary reviewHref={href('review', finished[0]!, finished[finished.length - 1]!)} />

      {isOn(f, 'aiAssistant') && isOn(f, 'insights') && (
        <div className="card ov-card">
          <Row to={href('insights')} icon="insights" title={t('insights.open')}>
            {t('overview.patterns')}
          </Row>
        </div>
      )}

      {offNames.length > 0 && (
        <p className="small muted ov-more">
          {t('overview.offList', { names: offNames.join(', ') })} <a href={href('settings')}>{t('overview.turnOn')}</a>
        </p>
      )}
      <p className="small muted ov-more">{t('overview.stripKey')}</p>
    </section>
  );
}

const OFF_NAME: Record<'sleep' | 'activity' | 'water' | 'journal', MessageKey> = {
  sleep: 'nights.title',
  activity: 'activity.short',
  water: 'water.title',
  journal: 'journal.title',
};

function Row({ to, icon, title, strip, children }: { to: string; icon: string; title: string; strip?: ReactNode; children: ReactNode }) {
  return (
    <a className="ov-row" href={to}>
      <Icon name={icon} size={20} />
      <span className="ov-text">
        <span className="ov-head">
          <span className="ov-title">{title}</span>
          {strip}
        </span>
        <span className="ov-sub">{children}</span>
      </span>
      <Icon name="chevron" size={16} />
    </a>
  );
}

/** The last 7 days as dots, oldest first: filled = logged, ring = nothing logged, dash = skipped, gap = not asked. */
function Strip({ marks, layer }: { marks: Mark[]; layer: Layer }) {
  const logged = marks.filter((m) => m === 'logged').length;
  const missing = marks.filter((m) => m === 'missing').length;
  return (
    <span className={`ov-strip cal-${layer}`} role="img" aria-label={t('overview.stripSpoken', { logged, missing })}>
      {marks.map((m, i) => (
        <span key={i} className={`cal-dot mark-${m}`} />
      ))}
    </span>
  );
}

/** Nutrient counts per status, each with its icon (status is never colour alone). */
function Tally({ tally }: { tally: Partial<Record<GaugeStatus, number>> }) {
  const shown = TALLY.filter((s) => tally[s]);
  return (
    <span className="ov-tally" aria-label={shown.map((s) => `${tally[s]} ${statusLabel(s)}`).join(', ')}>
      {shown.map((s) => (
        <span key={s} className={`status status-${s}`} aria-hidden>
          <Icon name={STATUS_ICON[s]} size={14} />
          {tally[s]}
        </span>
      ))}
    </span>
  );
}
