import type { NutrientResult } from '../model/simulate';
import { NUTRIENT_BY_ID } from '../model/nutrients';
import { fmtAmount, fmtFill, fmtPercent } from '../lib/format';
import { STATUS_ICON, StatusBadge, statusLabel } from './status';
import { Icon } from './Icon';
import { t } from '../i18n';

interface Props {
  result: NutrientResult;
  showRange: boolean;
  advanced: boolean;
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

export function Gauge({ result: r, showRange, advanced, onClick, defaultBased }: Props) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const name = def?.short ?? r.id;
  const noData = r.status === 'unknown' || hasNoData(r);
  const central = noData ? 0 : toScale(r, r.value.central);
  const lo = noData ? 0 : toScale(r, r.value.low);
  const hi = noData ? 0 : toScale(r, r.value.high);
  const label = noData ? '–' : gaugeLabel(r);
  const range =
    showRange && r.kind !== 'info' && !noData && hi - lo > 0.02 ? `${fmtPercent(r.value.low)}–${fmtPercent(r.value.high)}` : null;
  const kindLabel = r.kind === 'tank' ? t('gauge.kindTank') : r.kind === 'balance' ? t('gauge.kindBalance', { days: r.windowDays }) : r.kind === 'info' ? t('gauge.kindInfo') : t('gauge.kindRolling', { days: r.windowDays });

  return (
    <button className={`gauge gauge-${r.kind} gauge-${r.status}`} onClick={onClick} aria-label={`${def?.name ?? r.id}: ${label}`}>
      <div className="gauge-head">
        <span className="gauge-name">{name}</span>
        {defaultBased && <span className="gauge-default" title={t('gauge.defaultBased')}>*</span>}
      </div>
      <div className="gauge-body">
        {r.kind === 'tank' ? (
          <div className="tank" aria-hidden>
            {showRange && <div className="tank-range" style={{ bottom: `${lo * 100}%`, height: `${(hi - lo) * 100}%` }} />}
            <div className="tank-fill" style={{ height: `${central * 100}%` }} />
          </div>
        ) : (
          <div className="bar" aria-hidden>
            {showRange && r.kind !== 'info' && <div className="bar-range" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />}
            {r.kind !== 'info' && <div className="bar-fill" style={{ width: `${central * 100}%` }} />}
            {r.kind !== 'info' && <div className="bar-target" style={{ left: `${(1 / 1.5) * 100}%` }} />}
          </div>
        )}
        <div className="gauge-values">
          <span className="gauge-value">{label}</span>
          {range && <span className="gauge-range">{range}</span>}
        </div>
      </div>
      <div className="gauge-foot">
        <StatusBadge status={r.status} compact />
        {advanced && <span className="gauge-kind">{kindLabel}</span>}
      </div>
    </button>
  );
}
