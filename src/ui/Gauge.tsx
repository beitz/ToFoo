import type { NutrientResult, StoreResult } from '../model/simulate';
import { storeTrendOf, trendOf, type Trend } from '../model/trend';
import { NUTRIENT_BY_ID } from '../model/nutrients';
import { storeNeedsAttention } from '../logic/stores';
import { fmtAmount, fmtFill, fmtPercent } from '../lib/format';
import { STATUS_ICON, statusLabel } from './status';
import { Icon } from './Icon';
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

/** Visual scale: averages show 0–150 % of the need, so the 100 % mark sits at two thirds of the bar. */
const toScale = (v: number) => clamp01(v / 1.5);

function gaugeLabel(r: NutrientResult): string {
  return r.kind === 'info' ? `${fmtAmount(r.id, r.averageIntake)}/day` : r.kind === 'limit' ? t('gauge.ofMax', { pct: fmtPercent(r.value.central) }) : fmtPercent(r.value.central);
}

/**
 * Dense variant: one line with status icon, name and value, and a thin bar below.
 * `cell` is the narrow column layout used in the energy/macro row.
 */
export function CompactGauge({ result: r, onClick, defaultBased, variant = 'row' }: Pick<Props, 'result' | 'onClick' | 'defaultBased'> & { variant?: 'row' | 'cell' }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const name = def?.short ?? r.id;
  // Cells are narrow: no "of max" / "/day" suffixes there.
  const cellValue = r.kind === 'info' ? fmtAmount(r.id, r.averageIntake) : fmtPercent(r.value.central);
  const noData = r.status === 'unknown' || hasNoData(r);
  const value = noData ? '–' : variant === 'cell' ? cellValue : gaugeLabel(r);
  const icon = <Icon name={STATUS_ICON[r.status]} size={14} />;
  const fill = noData ? 0 : toScale(r.value.central);
  return (
    <button
      className={`cgauge cgauge-${variant} gauge-${r.kind} gauge-${r.status}`}
      onClick={onClick}
      aria-label={`${def?.name ?? r.id}: ${noData ? '' : gaugeLabel(r)}, ${statusLabel(r.status)}`}
    >
      <span className="cgauge-line">
        {variant === 'row' && icon}
        <span className="cgauge-name">
          {name}
          {defaultBased && <span className="gauge-default">*</span>}
        </span>
        {variant === 'row' && <span className="cgauge-value">{value}</span>}
      </span>
      {variant === 'cell' && (
        <span className="cgauge-line">
          {icon}
          <span className="cgauge-value">{value}</span>
        </span>
      )}
      {r.kind !== 'info' && (
        <span className="cgauge-bar" aria-hidden>
          <span className="cgauge-fill" style={{ width: `${fill * 100}%` }} />
          <span className="cgauge-target" style={{ left: `${(1 / 1.5) * 100}%` }} />
        </span>
      )}
    </button>
  );
}

/** Arrows for a trend: ↑↑↑ soon at the next status line, ↑ slow, → steady. */
export function trendArrows(tr: Trend): string {
  return tr.direction === 'steady' ? '→' : (tr.direction === 'up' ? '↑' : '↓').repeat(tr.speed);
}

/** Spoken / tooltip text for a trend. */
export function trendLabel(tr: Trend): string {
  if (tr.direction === 'steady') return t('trend.steady');
  const dir = t(tr.direction === 'up' ? 'trend.up' : 'trend.down');
  if (tr.daysToNext === undefined) return dir;
  return t(tr.speed === 3 ? 'trend.withinWeek' : tr.speed === 2 ? 'trend.withinMonth' : 'trend.slow', { dir });
}

/** Spoken / tooltip text for a store's trend: filling, draining, holding or staying empty. */
export function storeTrendLabel(tr: Trend): string {
  if (tr.direction === 'steady') return t(tr.better === false ? 'store.staysEmpty' : 'store.holding');
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
 * and the trend arrows. A ⚠ after the name when the nutrient's body store is low and not filling.
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
  const warn = r.store && storeNeedsAttention(r.store);
  return (
    <button
      className={`nrow gauge-${r.kind} gauge-${r.status}`}
      onClick={onClick}
      aria-label={`${def?.name ?? r.id}: ${noData ? t('gauge.noData') : gaugeLabel(r)}${range}, ${statusLabel(r.status)}${warn ? `, ${t('store.warnSpoken')}` : ''}`}
    >
      <Icon name={STATUS_ICON[r.status]} size={14} />
      <span className="nrow-name">
        {name}
        {defaultBased && <span className="gauge-default">*</span>}
        {warn && (
          <span className="nrow-warn" title={t('store.warnSpoken')}>
            <Icon name="warning" size={14} />
          </span>
        )}
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

/** One line per body store on the Stores screen: status by fill level, name, fill bar, "% full", filling arrows. */
export function StoreRow({ result: r, showRange, onClick }: { result: NutrientResult & { store: StoreResult }; showRange: boolean; onClick?: () => void }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const st = r.store;
  const warn = storeNeedsAttention(st);
  const fill = { low: clamp01(st.fill.low), central: clamp01(st.fill.central), high: clamp01(st.fill.high) };
  const range = showRange && fill.high - fill.low > 0.01 ? `, ${t('gauge.rangeSpoken', { low: fmtFill(fill.low), high: fmtFill(fill.high) })}` : '';
  return (
    <button
      className={`nrow gauge-store gauge-${st.status}`}
      onClick={onClick}
      aria-label={`${def?.name ?? r.id}: ${t('gauge.full', { pct: fmtFill(st.fill.central) })}${range}, ${statusLabel(st.status)}${warn ? `, ${t('store.warnSpoken')}` : ''}`}
    >
      <Icon name={STATUS_ICON[st.status]} size={14} />
      <span className="nrow-name">
        {def?.short ?? r.id}
        {warn && (
          <span className="nrow-warn" title={t('store.warnSpoken')}>
            <Icon name="warning" size={14} />
          </span>
        )}
      </span>
      <Bar value={fill} showRange={showRange} />
      <span className="nrow-value" aria-hidden>
        {fmtFill(st.fill.central)}
        <small> {t('gauge.fullShort')}</small>
      </span>
      <StoreTrendMark store={st} />
    </button>
  );
}
