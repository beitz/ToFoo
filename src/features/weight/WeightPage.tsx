import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { addDays, daysBetween, formatDay, parseDay, weekdayShort } from '../../lib/dates';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG, type LogCheck, type TrendPoint } from '../../logic/weight';
import { weightCheck } from '../../../model/parameters';
import { BackButton } from '../../ui/BackButton';
import { DateInput } from '../../ui/DateInputs';
import { Field, NumberInput, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { InfoButton } from '../../ui/InfoButton';
import { fmtKcal10, fmtKg, fmtKgChange } from './format';
import { useWeight } from './useWeight';
import { deleteWeighIn, saveWeighIn } from './weighIns';

const WINDOWS = ['30', '90', '365'] as const;
type Window = (typeof WINDOWS)[number];

/**
 * #/weight (docs/SPEC.md, "Weight"; owner's pick 2026-10-23): weigh-ins with a smoothed trend, and a
 * check whether the food log can be complete. A check on the log, never a weight goal: no targets,
 * no colours for up or down, no praise for either.
 */
export function WeightPage() {
  const d = useData();
  const { points, check } = useWeight();
  const [win, setWin] = useState<Window>('90');
  const from = addDays(d.today, -(Number(win) - 1));
  const last = points[points.length - 1];
  // The trend four weeks ago: the last point on or before that day.
  const monthAgo = [...points].reverse().find((p) => p.day <= addDays(d.today, -(weightCheck.window.value.days - 1)));
  const shown = points.filter((p) => p.day >= from).reverse();
  // The same 4-week change the log check uses once it has one, so the page never shows two.
  const change4w = 'changeKg' in check ? check.changeKg : monthAgo && last ? last.trend - monthAgo.trend : undefined;

  return (
    <section>
      <header className="page-head row">
        <BackButton to={['overview']} />
        <h1 className="grow">{t('weight.title')}</h1>
      </header>

      <AddWeighIn />

      <div className="card tracker-hero" data-tour="weight.trend">
        <div className="card-head">
          <h2>{t('weight.trend')}</h2>
          <InfoButton title={t('weight.trend')}>
            <p>{t('weight.trendInfo')}</p>
            <p className="small muted">{t('weight.trendSource')}</p>
          </InfoButton>
        </div>
        {last ? (
          <>
            <p className="tracker-big">{t('weight.kg', { kg: fmtKg(last.trend) })}</p>
            <p className="muted small">
              {t('weight.lastWeighIn', { kg: fmtKg(last.kg), day: formatDay(last.day, d.today) })}
              {change4w !== undefined && ` · ${t('weight.change4w', { kg: fmtKgChange(change4w) })}`}
            </p>
            <Segmented label={t('tracker.window')} value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w, label: t('tracker.days', { n: Number(w) }) }))} />
            <WeightChart points={points} from={from} to={d.today} />
          </>
        ) : (
          <p className="muted">{t('weight.none')}</p>
        )}
      </div>

      <LogCheckCard check={check} />

      {shown.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>{t('weight.weighIns')}</h2>
          </div>
          <ul className="plain-list">
            {shown.map((w) => (
              <WeighInRow key={w.day} point={w} />
            ))}
          </ul>
        </div>
      )}
      <p className="small muted ov-more">{t('weight.notAGoal')}</p>
    </section>
  );
}

function AddWeighIn() {
  const d = useData();
  const toast = useToast();
  const [kg, setKg] = useState<number>();
  const [day, setDay] = useState(d.today);
  const valid = kg !== undefined && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG && day <= d.today;
  const latest = useMemo(() => [...d.profile.weightHistory].sort((a, b) => b.day.localeCompare(a.day))[0], [d.profile.weightHistory]);
  return (
    <div className="card weight-add">
      <div className="weight-add-row">
        <Field label={t('weight.weight')}>{(id) => <NumberInput id={id} value={kg} onChange={setKg} suffix="kg" min={MIN_WEIGHT_KG} placeholder={latest ? fmtKg(latest.kg) : '70.0'} />}</Field>
        <Field label={t('weight.day')}>{(id) => <DateInput id={id} value={day} max={d.today} onChange={(e) => e.target.value && setDay(e.target.value)} />}</Field>
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={async () => {
            if (!valid) return;
            const undo = await saveWeighIn(day, kg);
            setKg(undefined);
            toast(t('weight.saved', { kg: fmtKg(kg) }), undo);
          }}
        >
          {t('weight.save')}
        </button>
      </div>
    </div>
  );
}

function WeighInRow({ point }: { point: TrendPoint }) {
  const d = useData();
  const toast = useToast();
  return (
    <li className="row-between tracker-row">
      <span>{formatDay(point.day, d.today)}</span>
      <span className="row">
        <strong>{t('weight.kg', { kg: fmtKg(point.kg) })}</strong>
        <button
          className="icon-btn"
          aria-label={t('weight.delete', { day: formatDay(point.day, d.today) })}
          onClick={async () => {
            const undo = await deleteWeighIn(point.day);
            toast(t('weight.deleted'), undo);
          }}
        >
          <Icon name="trash" size={18} />
        </button>
      </span>
    </li>
  );
}

const CHART = { w: 320, h: 150, left: 36, right: 8, top: 8, bottom: 20 };

/** Weigh-ins as dots and the trend as a line, over the window; kg on the left, first and last day below. */
function WeightChart({ points, from, to }: { points: readonly TrendPoint[]; from: string; to: string }) {
  const d = useData();
  const inside = points.filter((p) => p.day >= from && p.day <= to);
  // The trend runs in from the last weigh-in before the window, so it doesn't start from nothing.
  const before = [...points].reverse().find((p) => p.day < from);
  if (inside.length === 0) return <p className="muted small">{t('weight.noneInWindow')}</p>;
  const values = [...inside.flatMap((p) => [p.kg, p.trend]), ...(before ? [before.trend] : [])];
  const lo = Math.floor(Math.min(...values) - 0.5);
  const hi = Math.ceil(Math.max(...values) + 0.5);
  const span = Math.max(1, daysBetween(from, to));
  const x = (day: string) => CHART.left + (Math.max(0, daysBetween(from, day)) / span) * (CHART.w - CHART.left - CHART.right);
  const y = (kg: number) => CHART.top + ((hi - kg) / (hi - lo)) * (CHART.h - CHART.top - CHART.bottom);
  const trend = [...(before ? [{ day: from, trend: before.trend }] : []), ...inside].map((p) => `${x(p.day).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ');
  const mid = Math.round((lo + hi) / 2);
  const label = (day: string) => (day === d.today ? t('tracker.today') : `${weekdayShort(day)} ${parseDay(day).getDate()}.${parseDay(day).getMonth() + 1}.`);
  const lastPoint = inside[inside.length - 1]!;
  return (
    <figure className="weight-chart">
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} role="img" aria-label={t('weight.chartSpoken', { n: inside.length, kg: fmtKg(lastPoint.trend) })}>
        {[lo, mid, hi].map((kg) => (
          <g key={kg}>
            <line className="weight-grid" x1={CHART.left} x2={CHART.w - CHART.right} y1={y(kg)} y2={y(kg)} />
            <text className="weight-axis" x={CHART.left - 6} y={y(kg) + 4} textAnchor="end">
              {kg}
            </text>
          </g>
        ))}
        <polyline className="weight-trend" points={trend} />
        {inside.map((p) => (
          <circle key={p.day} className="weight-dot" cx={x(p.day)} cy={y(p.kg)} r={3} />
        ))}
        <text className="weight-axis" x={CHART.left} y={CHART.h - 4}>
          {label(from)}
        </text>
        <text className="weight-axis" x={CHART.w - CHART.right} y={CHART.h - 4} textAnchor="end">
          {label(to)}
        </text>
      </svg>
      <figcaption className="small muted weight-key">
        <span className="weight-key-dot" aria-hidden /> {t('weight.keyWeighIns')} <span className="weight-key-line" aria-hidden /> {t('weight.keyTrend')}
      </figcaption>
    </figure>
  );
}

const pct5 = (share: number) => Math.round((share * 100) / 5) * 5;

/** Is the food log about complete? What the weight says was eaten against what was logged. */
function LogCheckCard({ check }: { check: LogCheck }) {
  const w = weightCheck.window.value;
  return (
    <div className="card log-check" data-tour="weight.check">
      <div className="card-head">
        <h2>{t('weight.checkTitle')}</h2>
        <InfoButton title={t('weight.checkTitle')}>
          <p>{t('weight.checkHow')}</p>
          <p>{t('weight.checkLimits')}</p>
          <p className="small muted">{t('weight.checkSources')}</p>
        </InfoButton>
      </div>
      {check.state === 'needWeighIns' ? (
        <p className="muted">{t('weight.needWeighIns', { n: w.minWeighIns, weeks: Math.round(w.minSpanDays / 7), have: check.weighIns })}</p>
      ) : check.state === 'needLog' ? (
        <p className="muted">{t('weight.needLog', { n: w.minLoggedDays, of: w.days, have: check.loggedDays })}</p>
      ) : check.state === 'needAge' ? (
        <p className="muted">
          {t('weight.needAge')} <a href={href('settings', 'profile')}>{t('weight.toProfile')}</a>
        </p>
      ) : (
        <>
          <p className={`log-check-verdict log-check-${check.state}`}>
            <Icon name={check.state === 'fits' ? 'check' : check.state === 'low' ? 'alert' : 'info'} size={20} />
            <span>
              {check.state === 'fits'
                ? t('weight.fits')
                : check.state === 'low'
                  ? t('weight.low', { pct: Math.max(5, pct5(check.missingShare)) })
                  : t('weight.high')}
            </span>
          </p>
          <dl className="log-check-rows">
            <dt>{t('weight.rowLogged')}</dt>
            <dd>{t('weight.kcalDay', { kcal: fmtKcal10(check.loggedKcal) })}</dd>
            <dt>{t('weight.rowWeight')}</dt>
            <dd>{t('weight.change', { kg: fmtKgChange(check.changeKg) })}</dd>
            <dt>{t('weight.rowEaten')}</dt>
            <dd>
              {t('weight.kcalDay', { kcal: fmtKcal10(check.eatenKcal.central) })}
              <span className="muted small block">{t('weight.range', { low: fmtKcal10(check.eatenKcal.low), high: fmtKcal10(check.eatenKcal.high) })}</span>
            </dd>
          </dl>
          <p className="small muted">{t('weight.checkBasis', { n: check.loggedDays, of: w.days, burn: fmtKcal10(check.burnKcal) })}</p>
          {check.state === 'low' && <p className="small">{t('weight.lowHint')}</p>}
        </>
      )}
    </div>
  );
}
