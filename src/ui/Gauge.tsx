import type { NutrientResult } from '../model/simulate';
import { trendOf, type Trend } from '../model/trend';
import { NUTRIENT_BY_ID } from '../model/nutrients';
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
 * No logged or fasted day in the window yet. Rolling values are then pure imputation (the model assumes
 * you met your need, so it shows 100 %), and limit / info values are an average over zero days: neither
 * is a measurement, so the UI shows "–" and an empty bar. Tanks always have a modelled level.
 */
export const hasNoData = (r: NutrientResult) => r.kind !== 'tank' && r.knownDays === 0;

/** Visual scale: rolling averages show 0–150 % of the need; tanks 0–100 % full. */
function toScale(r: NutrientResult, v: number): number {
  if (r.kind === 'tank') return clamp01(v);
  return clamp01(v / 1.5);
}

function gaugeLabel(r: NutrientResult): string {
  return r.kind === 'info'
    ? `${fmtAmount(r.id, r.averageIntake)}/day`
    : r.kind === 'tank'
      ? t('gauge.full', { pct: fmtFill(r.value.central) })
      : r.kind === 'limit'
        ? t('gauge.ofMax', { pct: fmtPercent(r.value.central) })
        : fmtPercent(r.value.central);
}

/**
 * Dense variant: one line with status icon, name and value, and a thin bar below.
 * `cell` is the narrow column layout used in the energy/macro row.
 */
export function CompactGauge({ result: r, onClick, defaultBased, variant = 'row' }: Pick<Props, 'result' | 'onClick' | 'defaultBased'> & { variant?: 'row' | 'cell' }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const name = def?.short ?? r.id;
  // Cells are narrow: no "full" / "/day" suffixes there.
  const cellValue = r.kind === 'info' ? fmtAmount(r.id, r.averageIntake) : r.kind === 'tank' ? fmtFill(r.value.central) : fmtPercent(r.value.central);
  const noData = r.status === 'unknown' || hasNoData(r);
  const value = noData ? '–' : variant === 'cell' ? cellValue : gaugeLabel(r);
  const icon = <Icon name={STATUS_ICON[r.status]} size={14} />;
  const fill = noData ? 0 : toScale(r, r.value.central);
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
          {r.kind !== 'tank' && <span className="cgauge-target" style={{ left: `${(1 / 1.5) * 100}%` }} />}
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

export function TrendMark({ result: r }: { result: NutrientResult }) {
  const tr = hasNoData(r) || r.status === 'unknown' ? null : trendOf(r);
  if (!tr) return <span className="trend trend-none" aria-hidden />;
  const tone = tr.better === true ? 'better' : tr.better === false ? 'worse' : 'neutral';
  const label = trendLabel(tr);
  return (
    <span className={`trend trend-${tone}`} title={label} aria-label={label} role="img">
      {trendArrows(tr)}
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
  const central = noData ? 0 : toScale(r, r.value.central);
  const lo = noData ? 0 : toScale(r, r.value.low);
  const hi = noData ? 0 : toScale(r, r.value.high);
  const band = showRange && !noData && hi - lo > 0.01;
  const pct = isInfo ? fmtAmount(r.id, r.averageIntake) : r.kind === 'tank' ? fmtFill(r.value.central) : fmtPercent(r.value.central);
  const suffix = isInfo ? t('gauge.perDay') : r.kind === 'tank' ? t('gauge.fullShort') : r.kind === 'limit' ? t('gauge.ofMaxShort') : '';
  const range = band ? `, ${t('gauge.rangeSpoken', { low: fmtPercent(r.value.low), high: fmtPercent(r.value.high) })}` : '';
  return (
    <button
      className={`nrow gauge-${r.kind} gauge-${r.status}`}
      onClick={onClick}
      aria-label={`${def?.name ?? r.id}: ${noData ? t('gauge.noData') : gaugeLabel(r)}${range}, ${statusLabel(r.status)}`}
    >
      <Icon name={STATUS_ICON[r.status]} size={14} />
      <span className="nrow-name">
        {name}
        {defaultBased && <span className="gauge-default">*</span>}
      </span>
      <span className="nrow-bar" aria-hidden>
        {!isInfo && (
          <>
            {band ? (
              <>
                <span className="nrow-fill" style={{ width: `${lo * 100}%` }} />
                <span className="nrow-band" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
                <span className="nrow-dot" style={{ left: `${central * 100}%` }} />
              </>
            ) : (
              <span className="nrow-fill" style={{ width: `${central * 100}%` }} />
            )}
            {r.kind !== 'tank' && <span className="nrow-target" style={{ left: `${(1 / 1.5) * 100}%` }} />}
          </>
        )}
      </span>
      <span className="nrow-value" aria-hidden>
        {noData ? '–' : pct}
        {!noData && suffix && <small> {suffix}</small>}
      </span>
      <TrendMark result={r} />
    </button>
  );
}
