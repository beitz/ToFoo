import { ketosis } from '../../../model/parameters';
import { estimateKetosis, type KetosisInput } from '../../model/ketosis';
import { t } from '../../i18n';

const W = 340;
const H = 170;
const PAD = { left: 30, right: 8, top: 8, bottom: 22 };

/** Hours shown: at least two days, and half a day beyond now, in steps of 12 h. */
export function chartHours(now: number): number {
  return Math.max(48, Math.ceil((now + 12) / 12) * 12);
}

/**
 * The estimated band and central line over hours since the last meal, with the phase lines and a
 * "now" mark. Same inputs as the estimate now, so the curve shows where this fast is heading.
 */
export function KetosisChart({ input }: { input: KetosisInput }) {
  const maxH = chartHours(input.hours);
  const step = maxH > 96 ? 2 : 1;
  const pts: Array<{ h: number; low: number; central: number; high: number }> = [];
  for (let h = 0; h <= maxH; h += step) pts.push({ h, ...estimateKetosis({ ...input, hours: h }).bhb });
  const { light, moderate, deep } = ketosis.phases.value;
  const top = Math.max(light * 2, ...pts.map((p) => p.high)) * 1.08;
  const x = (h: number) => PAD.left + (h / maxH) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - Math.min(v, top) / top) * (H - PAD.top - PAD.bottom);
  const band = `M${pts.map((p) => `${x(p.h)},${y(p.high)}`).join('L')}L${[...pts]
    .reverse()
    .map((p) => `${x(p.h)},${y(p.low)}`)
    .join('L')}Z`;
  const line = `M${pts.map((p) => `${x(p.h)},${y(p.central)}`).join('L')}`;
  const tickEvery = maxH <= 72 ? 12 : maxH <= 168 ? 24 : 48;
  const ticks: number[] = [];
  for (let h = 0; h <= maxH; h += tickEvery) ticks.push(h);
  const now = estimateKetosis(input).bhb.central;
  const lines = [
    { v: light, label: t('fast.chart.light') },
    { v: moderate, label: t('fast.chart.moderate') },
    { v: deep, label: t('fast.chart.deep') },
  ].filter((l) => l.v < top);

  return (
    <svg className="ketosis-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('fast.chart.aria')}>
      {lines.map((l) => (
        <g key={l.v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(l.v)} y2={y(l.v)} className="ketosis-chart-phase" />
          <text x={PAD.left - 4} y={y(l.v) + 3} textAnchor="end" className="ketosis-chart-axis">
            {l.v}
          </text>
        </g>
      ))}
      <path d={band} className="ketosis-chart-band" />
      <path d={line} className="ketosis-chart-line" />
      {/* Phase names at the left, where the curve is still low, so the band never covers them. */}
      {lines.map((l) => (
        <text key={l.v} x={PAD.left + 3} y={y(l.v) - 3} className="ketosis-chart-label">
          {l.label}
        </text>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="ketosis-chart-base" />
      {ticks.map((h) => (
        <text key={h} x={x(h)} y={H - 6} textAnchor={h === 0 ? 'start' : h === maxH ? 'end' : 'middle'} className="ketosis-chart-axis">
          {t('fast.hours', { h })}
        </text>
      ))}
      <line x1={x(input.hours)} x2={x(input.hours)} y1={PAD.top} y2={y(0)} className="ketosis-chart-now" />
      <circle cx={x(input.hours)} cy={y(now)} r={4} className="ketosis-chart-dot" />
      <text x={Math.min(x(input.hours) + 5, W - PAD.right - 24)} y={PAD.top + 10} className="ketosis-chart-label">
        {t('fast.chart.now')}
      </text>
    </svg>
  );
}
