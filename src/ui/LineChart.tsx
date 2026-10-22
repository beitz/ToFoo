import type { HistoryPoint } from '../model/simulate';
import { formatDate } from '../lib/dates';

interface Props {
  points: HistoryPoint[];
  /** Horizontal guide lines (value, label). */
  guides?: Array<{ value: number; label: string }>;
  maxY?: number;
  showRange: boolean;
  format: (v: number) => string;
  /** Where it is heading (dashed, after a "today" line): store fill if the recent rate goes on. */
  ahead?: HistoryPoint[];
  /** A day to mark on the line, e.g. the blood test the store was set from. */
  marker?: { day: string; label: string };
  todayLabel?: string;
  /** 'tank': drawn in the store colour (stores only). */
  tone?: 'tank';
}

/** Small responsive SVG line chart with an uncertainty band. */
export function LineChart({ points, guides = [], maxY, showRange, format, ahead = [], marker, todayLabel, tone }: Props) {
  if (points.length < 2) return null;
  const n = points.length + ahead.length;
  const W = 320;
  const H = 140;
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const top = Math.max(maxY ?? 0, ...points.map((p) => (showRange ? p.high : p.central)), ...ahead.map((p) => p.central), ...guides.map((g) => g.value)) * 1.05 || 1;
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - Math.min(v, top) / top) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.central).toFixed(1)}`).join('');
  const band =
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.high).toFixed(1)}`).join('') +
    [...points]
      .reverse()
      .map((p, j) => `L${x(points.length - 1 - j).toFixed(1)},${y(p.low).toFixed(1)}`)
      .join('') +
    'Z';
  const first = formatDate(points[0]!.day, false);
  const last = formatDate((ahead.at(-1) ?? points[points.length - 1]!).day, false);
  const now = points.length - 1;
  const aheadLine = ahead.length ? `M${x(now).toFixed(1)},${y(points[now]!.central).toFixed(1)}` + ahead.map((p, i) => `L${x(now + 1 + i).toFixed(1)},${y(p.central).toFixed(1)}`).join('') : '';
  const markAt = marker ? points.findIndex((p) => p.day === marker.day) : -1;
  return (
    <svg className={tone ? `chart chart-${tone}` : 'chart'} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="History">
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
      {aheadLine && (
        <>
          <line x1={x(now)} x2={x(now)} y1={pad.t} y2={H - pad.b} className="chart-today" />
          {todayLabel && (
            <text x={x(now)} y={H - 4} className="chart-label" textAnchor="middle">
              {todayLabel}
            </text>
          )}
          <path d={aheadLine} className="chart-line chart-ahead" />
        </>
      )}
      {markAt >= 0 && marker && (
        <g>
          <circle cx={x(markAt)} cy={y(points[markAt]!.central)} r={4} className="chart-marker" />
          <text x={x(markAt)} y={y(points[markAt]!.central) - 8} className="chart-label" textAnchor="middle">
            {marker.label}
          </text>
        </g>
      )}
      <text x={pad.l} y={H - 4} className="chart-label">
        {first}
      </text>
      <text x={W - pad.r} y={H - 4} className="chart-label" textAnchor="end">
        {last}
      </text>
    </svg>
  );
}
