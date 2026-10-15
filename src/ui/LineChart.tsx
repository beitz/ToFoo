import type { HistoryPoint } from '../model/simulate';

interface Props {
  points: HistoryPoint[];
  /** Horizontal guide lines (value, label). */
  guides?: Array<{ value: number; label: string }>;
  maxY?: number;
  showRange: boolean;
  format: (v: number) => string;
}

/** Small responsive SVG line chart with an uncertainty band. */
export function LineChart({ points, guides = [], maxY, showRange, format }: Props) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 140;
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const top = Math.max(maxY ?? 0, ...points.map((p) => (showRange ? p.high : p.central)), ...guides.map((g) => g.value)) * 1.05 || 1;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - Math.min(v, top) / top) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.central).toFixed(1)}`).join('');
  const band =
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.high).toFixed(1)}`).join('') +
    [...points].reverse().map((p, j) => `L${x(points.length - 1 - j).toFixed(1)},${y(p.low).toFixed(1)}`).join('') +
    'Z';
  const first = points[0]!.day.slice(5);
  const last = points[points.length - 1]!.day.slice(5);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="History">
      {guides.map((g) => (
        <g key={g.label}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g.value)} y2={y(g.value)} className="chart-guide" />
          <text x={pad.l - 4} y={y(g.value) + 4} className="chart-label" textAnchor="end">
            {g.label}
          </text>
        </g>
      ))}
      <text x={pad.l - 4} y={y(0) + 4} className="chart-label" textAnchor="end">
        {format(0)}
      </text>
      {showRange && <path d={band} className="chart-band" />}
      <path d={line} className="chart-line" />
      <text x={pad.l} y={H - 4} className="chart-label">
        {first}
      </text>
      <text x={W - pad.r} y={H - 4} className="chart-label" textAnchor="end">
        {last}
      </text>
    </svg>
  );
}
