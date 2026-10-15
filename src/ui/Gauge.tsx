import type { NutrientResult } from '../model/simulate';
import { NUTRIENT_BY_ID } from '../model/nutrients';
import { fmtAmount, fmtPercent } from '../lib/format';
import { StatusBadge } from './status';
import { t } from '../i18n';

interface Props {
  result: NutrientResult;
  showRange: boolean;
  advanced: boolean;
  onClick?: () => void;
  defaultBased?: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Visual scale: rolling averages show 0–150 % of the need; tanks 0–100 % full. */
function toScale(r: NutrientResult, v: number): number {
  if (r.kind === 'tank') return clamp01(v);
  return clamp01(v / 1.5);
}

export function Gauge({ result: r, showRange, advanced, onClick, defaultBased }: Props) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const name = def?.short ?? r.id;
  const central = toScale(r, r.value.central);
  const lo = toScale(r, r.value.low);
  const hi = toScale(r, r.value.high);
  const label =
    r.kind === 'info'
      ? `${fmtAmount(r.id, r.averageIntake)}/day`
      : r.kind === 'tank'
        ? t('gauge.full', { pct: fmtPercent(r.value.central) })
        : fmtPercent(r.value.central);
  const range =
    showRange && r.kind !== 'info' && r.status !== 'unknown' && hi - lo > 0.02 ? `${fmtPercent(r.value.low)}–${fmtPercent(r.value.high)}` : null;
  const kindLabel = r.kind === 'tank' ? t('gauge.kindTank') : r.kind === 'info' ? t('gauge.kindInfo') : t('gauge.kindRolling', { days: r.windowDays });

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
          <span className="gauge-value">{r.status === 'unknown' ? '–' : label}</span>
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
