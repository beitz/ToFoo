import { earlyReading, type GaugeStatus, type NutrientResult, type StoreResult } from '../model/simulate';
import { storeTrendOf, trendOf, type Trend } from '../model/trend';
import { NUTRIENT_BY_ID } from '../model/nutrients';
import { storeNeedsAttention } from '../logic/stores';
import { fmtAmount, fmtFill, fmtNumber, fmtPercent } from '../lib/format';
import { statusIconOf, statusText } from './status';
import { Icon } from './Icon';
import { fmtDuration } from './duration';
import { t } from '../i18n';

interface Props {
  result: NutrientResult;
  showRange: boolean;
  onClick?: () => void;
  defaultBased?: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * No logged or fasted day in the window yet. Averages are then pure imputation (the model assumes you met your
 * need, so it shows 100 %), and limit / info values are an average over zero days: neither is a measurement, so
 * the UI shows "–" and an empty bar.
 */
export const hasNoData = (r: NutrientResult) => r.knownDays === 0;

/** Marks a line whose percent compares with the user's own target instead of the reference value. */
function OwnMark({ result: r }: { result: NutrientResult }) {
  return r.ownTarget ? (
    <span className="gauge-own" title={t('gauge.ownTarget')}>
      <Icon name="target" size={12} />
    </span>
  ) : null;
}

const ownSpoken = (r: NutrientResult) => (r.ownTarget ? `, ${t('gauge.ownTarget')}` : '');

/** The status icon: an early low reading gets the "below" arrow, not the warning sign (too early to warn). */
const iconStatus = (r: NutrientResult): GaugeStatus => (r.status === 'low' && earlyReading(r) ? 'gettingLow' : r.status);

/** The icon on a line: the circled wave when the likely range crosses a status line ("unclear"). */
const lineIcon = (r: NutrientResult): string => statusIconOf(iconStatus(r), r.statusSpan);

/**
 * How many days a line averages, when that differs from its card's heading (`usual`, e.g. 7): "14 d"
 * for the omega-3 fats, or "5 of 14 d" while the log is younger than the window (owner, 2026-10-23).
 */
export function windowTag(r: NutrientResult, usual?: number): { text: string; short: string; spoken: string } | null {
  if (r.kind === 'info' || r.store || hasNoData(r)) return null;
  const early = earlyReading(r);
  if (early && early.of !== usual) return { text: t('gauge.windowEarly', early), short: t('gauge.windowEarlyShort', early), spoken: t('gauge.windowEarlySpoken', early) };
  if (!early && usual !== undefined && r.windowLength !== undefined && r.windowLength !== usual) {
    const text = t('gauge.window', { n: r.windowLength });
    return { text, short: text, spoken: t('gauge.windowSpoken', { n: r.windowLength }) };
  }
  return null;
}

/** `reserve`: keep the tag's room even without one, so every bar in a grid has the same length. */
function WindowTag({ result: r, usual, short, reserve }: { result: NutrientResult; usual?: number; short?: boolean; reserve?: boolean }) {
  const tag = windowTag(r, usual);
  return tag || reserve ? (
    <span className="gauge-window" aria-hidden>
      {tag ? (short ? tag.short : tag.text) : ''}
    </span>
  ) : null;
}

const windowSpoken = (r: NutrientResult, usual?: number) => {
  const tag = windowTag(r, usual);
  return tag ? `, ${tag.spoken}` : '';
};

/** Visual scale: averages show 0–150 % of the need, so the 100 % mark sits at two thirds of the bar. */
const toScale = (v: number) => clamp01(v / 1.5);

function gaugeLabel(r: NutrientResult): string {
  return r.kind === 'info' ? `${fmtAmount(r.id, r.averageIntake)}/day` : r.kind === 'limit' ? t('gauge.ofMax', { pct: fmtPercent(r.value.central) }) : fmtPercent(r.value.central);
}

/**
 * Dense variant: one line with status icon, name and value, and a thin bar below.
 * `cell` is the narrow column layout used in the energy/macro row.
 */
export function CompactGauge({
  result: r,
  onClick,
  defaultBased,
  variant = 'row',
  usualWindow,
  reserveWindow,
}: Pick<Props, 'result' | 'onClick' | 'defaultBased'> & { variant?: 'row' | 'cell'; usualWindow?: number; reserveWindow?: boolean }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const name = def?.short ?? r.id;
  // Cells are narrow: no "of max" / "/day" suffixes or units there. A limit cell shows the amount against
  // the maximum ("42/50"), so it can't be mistaken for a percent of a need next to it.
  const cellValue =
    r.kind === 'info' ? (
      fmtAmount(r.id, r.averageIntake)
    ) : r.kind === 'limit' && r.limit !== undefined ? (
      <>
        {fmtNumber(r.averageIntake)}
        <small className="cgauge-max">/{fmtNumber(r.limit)}</small>
      </>
    ) : (
      fmtPercent(r.value.central)
    );
  const noData = r.status === 'unknown' || hasNoData(r);
  const value = noData ? '–' : variant === 'cell' ? cellValue : gaugeLabel(r);
  const icon = <Icon name={lineIcon(r)} size={14} />;
  const fill = noData ? 0 : toScale(r.value.central);
  return (
    <button
      className={`cgauge cgauge-${variant} gauge-${r.kind} gauge-${r.status}`}
      onClick={onClick}
      aria-label={`${def?.name ?? r.id}: ${noData ? '' : gaugeLabel(r)}, ${statusText(r.status, r.statusSpan)}${ownSpoken(r)}${windowSpoken(r, usualWindow)}`}
    >
      <span className="cgauge-line">
        {variant === 'row' && icon}
        <span className="cgauge-name">
          {name}
          {defaultBased && <span className="gauge-default">*</span>}
        </span>
        {/* Outside the name, so a cut-off name never hides it. */}
        <OwnMark result={r} />
        {variant === 'row' && <span className="cgauge-value">{value}</span>}
      </span>
      {variant === 'cell' && (
        <span className="cgauge-line">
          {icon}
          <span className="cgauge-value">{value}</span>
        </span>
      )}
      {r.kind !== 'info' && (
        <span className="cgauge-barline">
          <span className="cgauge-bar" aria-hidden>
            <span className="cgauge-fill" style={{ width: `${fill * 100}%` }} />
            <span className="cgauge-target" style={{ left: `${(1 / 1.5) * 100}%` }} />
          </span>
          {/* On the bar's line, so a narrow cell's name keeps its room. */}
          {variant === 'row' && <WindowTag result={r} usual={usualWindow} short reserve={reserveWindow} />}
        </span>
      )}
    </button>
  );
}

/**
 * A body store as a compact row (Home's list layout, owner's ask 2026-10-23): status icon (⚠ when low and not
 * filling), name, % full with the filling / draining arrow, and a bar that is the store itself: full bar = full store.
 */
export function StoreCompactGauge({ result: r, onClick }: { result: NutrientResult & { store: StoreResult }; onClick: () => void }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const st = r.store;
  const warn = storeNeedsAttention(st);
  const tr = storeTrendOf(st);
  const full = t('gauge.full', { pct: fmtFill(st.fill.central) });
  const spoken = [`${def?.name ?? r.id}: ${full}`, statusText(st.status, st.statusSpan), tr ? storeTrendLabel(tr) : '', warn ? t('store.warnSpoken') : ''].filter(Boolean).join(', ');
  return (
    <button className={`cgauge cgauge-row gauge-store gauge-${st.status}`} onClick={onClick} aria-label={spoken}>
      <span className="cgauge-line">
        <Icon name={warn ? 'warning' : statusIconOf(st.status, st.statusSpan)} size={14} />
        <span className="cgauge-name">{def?.short ?? r.id}</span>
        <span className="cgauge-value">
          {/* The card's heading says "how full", so the narrow row shows only the percent. */}
          {fmtFill(st.fill.central)}
          {tr && <span className="cgauge-arrow"> {trendArrows(tr)}</span>}
        </span>
      </span>
      <span className="cgauge-bar" aria-hidden>
        <span className="cgauge-fill" style={{ width: `${clamp01(st.fill.central) * 100}%` }} />
      </span>
    </button>
  );
}

/**
 * One arrow for a trend (design system 2026-10-22): ↑ / ↓ fast (the next status line within a week),
 * ↗ / ↘ slower, → steady.
 */
export function trendArrows(tr: Trend): string {
  if (tr.direction === 'steady') return '→';
  if (tr.speed === 3) return tr.direction === 'up' ? '↑' : '↓';
  return tr.direction === 'up' ? '↗' : '↘';
}

/** Spoken / tooltip text for a trend. */
export function trendLabel(tr: Trend): string {
  if (tr.direction === 'steady') return t(tr.unsure ? 'trend.unsure' : 'trend.steady');
  const dir = t(tr.direction === 'up' ? 'trend.up' : 'trend.down');
  if (tr.daysToNext === undefined) return dir;
  return t(tr.speed === 3 ? 'trend.withinWeek' : tr.speed === 2 ? 'trend.withinMonth' : 'trend.slow', { dir });
}

/** Spoken / tooltip text for a store's trend: filling, draining, holding or staying empty. */
export function storeTrendLabel(tr: Trend): string {
  if (tr.direction === 'steady') return t(tr.better === false ? 'store.staysEmpty' : tr.unsure ? 'store.unsure' : 'store.holding');
  const dir = t(tr.direction === 'up' ? 'store.filling' : 'store.draining');
  if (tr.daysToNext === undefined) return dir;
  return t(tr.speed === 3 ? 'trend.withinWeek' : tr.speed === 2 ? 'trend.withinMonth' : 'trend.slow', { dir });
}

function Arrows({ tr, label }: { tr: Trend | null; label: (tr: Trend) => string }) {
  if (!tr) return <span className="trend trend-none" aria-hidden />;
  const tone = tr.better === true ? 'better' : tr.better === false ? 'worse' : 'neutral';
  const text = label(tr);
  return (
    <span className={`trend trend-${tone}`} title={text} aria-label={text} role="img">
      {trendArrows(tr)}
    </span>
  );
}

export function TrendMark({ result: r }: { result: NutrientResult }) {
  return <Arrows tr={hasNoData(r) || r.status === 'unknown' ? null : trendOf(r)} label={trendLabel} />;
}

/** The bar with its uncertainty band, for a value already on a 0–1 scale. */
function Bar({ value, showRange, target }: { value: { low: number; central: number; high: number } | null; showRange: boolean; target?: number }) {
  const band = value && showRange && value.high - value.low > 0.01;
  return (
    <span className="nrow-bar" aria-hidden>
      {value &&
        (band ? (
          <>
            <span className="nrow-fill" style={{ width: `${value.low * 100}%` }} />
            <span className="nrow-band" style={{ left: `${value.low * 100}%`, width: `${(value.high - value.low) * 100}%` }} />
            <span className="nrow-dot" style={{ left: `${value.central * 100}%` }} />
          </>
        ) : (
          <span className="nrow-fill" style={{ width: `${value.central * 100}%` }} />
        ))}
      {target !== undefined && <span className="nrow-target" style={{ left: `${target * 100}%` }} />}
    </span>
  );
}

/**
 * One line per nutrient: status, name, a bar with the uncertainty band and the 100 % mark, the value
 * and the trend arrows.
 */
export function GaugeRow({ result: r, showRange, onClick, defaultBased }: Pick<Props, 'result' | 'showRange' | 'onClick' | 'defaultBased'>) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const name = def?.short ?? r.id;
  const noData = r.status === 'unknown' || hasNoData(r);
  const isInfo = r.kind === 'info';
  const scaled = noData || isInfo ? null : { low: toScale(r.value.low), central: toScale(r.value.central), high: toScale(r.value.high) };
  const hasBand = !!scaled && showRange && scaled.high - scaled.low > 0.01;
  const pct = isInfo ? fmtAmount(r.id, r.averageIntake) : fmtPercent(r.value.central);
  const suffix = isInfo ? t('gauge.perDay') : r.kind === 'limit' ? t('gauge.ofMaxShort') : '';
  const range = hasBand ? `, ${t('gauge.rangeSpoken', { low: fmtPercent(r.value.low), high: fmtPercent(r.value.high) })}` : '';
  return (
    <button
      className={`nrow gauge-${r.kind} gauge-${r.status}`}
      onClick={onClick}
      aria-label={`${def?.name ?? r.id}: ${noData ? t('gauge.noData') : gaugeLabel(r)}${range}, ${statusText(r.status, r.statusSpan)}${ownSpoken(r)}${windowSpoken(r)}`}
    >
      <Icon name={lineIcon(r)} size={14} />
      <span className="nrow-name">
        {name}
        {defaultBased && <span className="gauge-default">*</span>}
        <OwnMark result={r} />
        <WindowTag result={r} />
      </span>
      {isInfo ? <span className="nrow-bar" aria-hidden /> : <Bar value={scaled} showRange={showRange} target={1 / 1.5} />}
      <span className="nrow-value" aria-hidden>
        {noData ? '–' : pct}
        {!noData && suffix && <small> {suffix}</small>}
      </span>
      <TrendMark result={r} />
    </button>
  );
}

/** Store trend: ↑ filling, ↓ draining, → holding; arrow count by how soon its fill status changes. */
export function StoreTrendMark({ store }: { store: StoreResult }) {
  return <Arrows tr={storeTrendOf(store)} label={storeTrendLabel} />;
}

/** Short duration for a narrow card: "9 d", "3 wk", "5 mo", "3.4 yr". */
export function fmtDurationShort(days: number): string {
  if (days < 14) return t('durationShort.days', { n: Math.max(1, Math.round(days)) });
  if (days < 60) return t('durationShort.weeks', { n: Math.round(days / 7) });
  if (days < 730) return t('durationShort.months', { n: Math.round(days / 30.44) });
  return t('durationShort.years', { n: fmtNumber(days / 365.25, 1) });
}

/**
 * How long the store would cover the need with nothing eaten at its current level (middle of the sourced
 * capacity range; sun left out for vitamin D). Null when the store size isn't known.
 */
export function storeLastsDays(st: StoreResult): number | null {
  const full = st.storeDays?.central;
  return full ? clamp01(st.fill.central) * full : null;
}

/**
 * A body store on Home: a small card with a tank that fills from the bottom (uncertainty as a shaded band),
 * "% full", filling / draining arrows, how long it lasts, and a ⚠ when it is low and not filling. Its status
 * and colour follow the fill level only.
 */
export function TankCard({ result: r, showRange, onClick }: { result: NutrientResult & { store: StoreResult }; showRange: boolean; onClick?: () => void }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const st = r.store;
  const warn = storeNeedsAttention(st);
  const fill = { low: clamp01(st.fill.low), central: clamp01(st.fill.central), high: clamp01(st.fill.high) };
  const band = showRange && fill.high - fill.low > 0.01;
  const tr = storeTrendOf(st);
  const lastsDays = storeLastsDays(st);
  // "empty" only when nothing is left, so it never sits next to "2% full".
  const lastsText = (fmt: (days: number) => string, under: string) =>
    lastsDays === null ? '' : lastsDays <= 0 ? t('tank.empty') : lastsDays < 1 ? t('tank.lasts', { time: under }) : t('tank.lasts', { time: fmt(lastsDays) });
  const lasts = lastsText(fmtDurationShort, t('durationShort.underDay'));
  const spokenLasts = lastsText(fmtDuration, t('duration.underDay'));
  const range = band ? `, ${t('gauge.rangeSpoken', { low: fmtFill(fill.low), high: fmtFill(fill.high) })}` : '';
  return (
    <button
      className={`tank-card gauge-${st.status}`}
      onClick={onClick}
      aria-label={[
        `${def?.name ?? r.id}: ${t('gauge.full', { pct: fmtFill(st.fill.central) })}${range}`,
        statusText(st.status, st.statusSpan),
        tr ? storeTrendLabel(tr) : '',
        spokenLasts,
        warn ? t('store.warnSpoken') : '',
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <span className="tank-card-head" aria-hidden>
        <Icon name={statusIconOf(st.status, st.statusSpan)} size={14} />
        <span className="tank-card-name">{def?.short ?? r.id}</span>
        {warn && (
          <span className="tank-card-warn">
            <Icon name="warning" size={14} />
          </span>
        )}
      </span>
      <span className="tank-card-body" aria-hidden>
        <span className="tank">
          {band ? (
            <>
              <span className="tank-fill" style={{ height: `${fill.low * 100}%` }} />
              <span className="tank-band" style={{ bottom: `${fill.low * 100}%`, height: `${(fill.high - fill.low) * 100}%` }} />
              <span className="tank-level" style={{ bottom: `${fill.central * 100}%` }} />
            </>
          ) : (
            <span className="tank-fill" style={{ height: `${fill.central * 100}%` }} />
          )}
        </span>
        <span className="tank-card-text">
          <span className="tank-card-value">
            {fmtFill(st.fill.central)}
            <small> {t('gauge.fullShort')}</small>
          </span>
          <StoreTrendMark store={st} />
          {lasts && <span className="tank-card-lasts">{lasts}</span>}
        </span>
      </span>
    </button>
  );
}
