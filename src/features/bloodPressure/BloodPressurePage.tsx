import { useMemo, useState } from 'react';
import { homeCategories, homeProtocol, low, veryHigh, whatMovesIt } from '../../../model/blood-pressure';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { daysBetween, formatDay, parseDay, weekdayShort } from '../../lib/dates';
import { bpAverage, bpByDay, bpCategory, bpInWindow, partOfDay, type BpAverage, type BpCategory } from '../../logic/bloodPressure';
import { windowDays } from '../../logic/trackers';
import { isOn } from '../../settings/features';
import type { BloodPressureReading } from '../../storage/types';
import { AskChips } from '../../ui/AskChips';
import { BackButton } from '../../ui/BackButton';
import { Icon } from '../../ui/Icon';
import { InfoButton } from '../../ui/InfoButton';
import { MissingDays, useMissingDays, WindowSwitch, type Window } from '../trackers/TrackerParts';
import { BpChip, ReadingRows, VeryHighNotice } from './BloodPressureCard';
import { BloodPressureSheet } from './BloodPressureSheet';
import { bpText } from './format';

/**
 * #/blood-pressure (docs/SPEC.md, "Blood pressure"; owner's ask 2026-11-13): the average over 7, 30
 * or 90 days with its category from the ESC 2024 home lines, morning and evening apart, a chart with
 * one bar per day from diastolic to systolic, the lines themselves, how to measure, what moves it,
 * and every reading. A day without readings is not measured, never a zero.
 */
export function BloodPressurePage() {
  const d = useData();
  const [win, setWin] = useState<Window>('7');
  const [sheet, setSheet] = useState<BloodPressureReading | 'new' | null>(null);
  const days = useMemo(() => windowDays(d.today, Number(win)), [d.today, win]);
  const inside = useMemo(() => bpInWindow(d.bloodPressure, d.today, Number(win)), [d.bloodPressure, d.today, win]);
  const avg = bpAverage(inside);
  const morning = bpAverage(inside.filter((r) => partOfDay(r.time) === 'morning'));
  const evening = bpAverage(inside.filter((r) => partOfDay(r.time) === 'evening'));
  const missing = useMissingDays('bloodPressure', days);
  const byDay = [...bpGroups(inside)].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <section>
      <header className="page-head row">
        <BackButton to={['overview']} />
        <h1 className="grow">{t('bp.title')}</h1>
        <button className="btn btn-small btn-primary" onClick={() => setSheet('new')}>
          <Icon name="plus" size={16} /> {t('tracker.add')}
        </button>
      </header>
      <WindowSwitch value={win} onChange={setWin} />

      <div className="card tracker-hero" data-tour="bp.average">
        <div className="card-head">
          <h2>{t('bp.average', { n: Number(win) })}</h2>
          <InfoButton title={t('bp.averageInfoTitle')}>
            <p>{t('bp.averageInfo', { days: homeProtocol.value.days, min: homeProtocol.value.minDays })}</p>
            <p className="small muted">{homeProtocol.source}</p>
          </InfoButton>
        </div>
        {avg ? (
          <>
            <p className="tracker-big bp-big">
              {bpText(avg)} <span className="bp-unit">mmHg</span> <BpChip category={bpCategory(avg)} />
            </p>
            <p className="muted small">
              {[avg.pulse !== undefined && t('bp.pulseValue', { n: avg.pulse }), t(avg.readings === 1 ? 'bp.readingsOne' : 'bp.readings', { n: avg.readings, days: avg.days })].filter(Boolean).join(' · ')}
            </p>
            {(morning || evening) && (
              <p className="small">
                {[morning && t('bp.morning', { value: bpText(morning) }), evening && t('bp.evening', { value: bpText(evening) })].filter(Boolean).join(' · ')}
              </p>
            )}
            {avg.days < homeProtocol.value.minDays && <p className="muted small">{t('bp.fewDays', { min: homeProtocol.value.minDays })}</p>}
          </>
        ) : (
          <p className="muted small">{t('bp.noneInWindow')}</p>
        )}
        <BpChart readings={inside} from={days[0]!} to={d.today} />
      </div>

      <VeryHighNotice readings={d.bloodPressure} />
      <MissingDays days={missing ?? []} />

      <Lines average={avg} />
      <HowToMeasure />
      <WhatMovesIt />

      <div className="card" data-tour="bp.readings">
        <div className="card-head">
          <h2>{t('bp.allReadings')}</h2>
        </div>
        {byDay.length === 0 ? (
          <p className="muted small">{t('tracker.none')}</p>
        ) : (
          byDay.map(([day, rs]) => (
            <div key={day} className="bp-day">
              <h3 className="small bp-day-head">
                <a href={href('diary', day)}>{formatDay(day, d.today)}</a>
              </h3>
              <ReadingRows readings={rs} onEdit={setSheet} />
            </div>
          ))
        )}
      </div>

      <AskChips questions={[t('ask.bpSalt')]} />
      {sheet && <BloodPressureSheet record={sheet === 'new' ? undefined : sheet} defaultTime={Date.now()} onClose={() => setSheet(null)} />}
    </section>
  );
}

const CHART = { w: 320, h: 160, left: 34, right: 8, top: 8, bottom: 20 };

/**
 * One bar per day with readings, from the day's average diastolic up to its average systolic; the
 * home "high" lines (135 and 85) dashed. Days without readings stay empty, never a zero.
 */
function BpChart({ readings, from, to }: { readings: readonly BloodPressureReading[]; from: string; to: string }) {
  const d = useData();
  const days = bpByDay(readings);
  if (!days.size) return null;
  const high = homeCategories.value.highFrom;
  const values = [...days.values()].flatMap((a) => [a.systolic, a.diastolic]);
  const lo = Math.floor((Math.min(...values, high.diastolic) - 10) / 10) * 10;
  const hi = Math.ceil((Math.max(...values, high.systolic) + 10) / 10) * 10;
  const span = Math.max(1, daysBetween(from, to));
  const x = (day: string) => CHART.left + 6 + (daysBetween(from, day) / span) * (CHART.w - CHART.left - CHART.right - 12);
  const y = (v: number) => CHART.top + ((hi - v) / (hi - lo)) * (CHART.h - CHART.top - CHART.bottom);
  const ticks = [lo, Math.round((lo + hi) / 20) * 10, hi];
  const label = (day: string) => (day === d.today ? t('tracker.today') : `${weekdayShort(day)} ${parseDay(day).getDate()}.${parseDay(day).getMonth() + 1}.`);
  const all = bpAverage(readings)!;
  return (
    <figure className="weight-chart bp-chart">
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} role="img" aria-label={t('bp.chartSpoken', { n: days.size, value: bpText(all) })}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="weight-grid" x1={CHART.left} x2={CHART.w - CHART.right} y1={y(v)} y2={y(v)} />
            <text className="weight-axis" x={CHART.left - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {[high.systolic, high.diastolic].map((v) => (
          <line key={v} className="bp-line" x1={CHART.left} x2={CHART.w - CHART.right} y1={y(v)} y2={y(v)} />
        ))}
        {[...days].map(([day, a]) => (
          <g key={day} className="bp-bar">
            <line x1={x(day)} x2={x(day)} y1={y(a.systolic)} y2={y(a.diastolic)} />
            <circle cx={x(day)} cy={y(a.systolic)} r={3.5} />
            <circle className="bp-dia" cx={x(day)} cy={y(a.diastolic)} r={3.5} />
          </g>
        ))}
        <text className="weight-axis" x={CHART.left} y={CHART.h - 4}>
          {label(from)}
        </text>
        <text className="weight-axis" x={CHART.w - CHART.right} y={CHART.h - 4} textAnchor="end">
          {label(to)}
        </text>
      </svg>
      <figcaption className="small muted weight-key">
        <span className="bp-key">
          <span className="bp-key-sys" aria-hidden /> {t('bp.keySys')}
        </span>{' '}
        <span className="bp-key">
          <span className="bp-key-dia" aria-hidden /> {t('bp.keyDia')}
        </span>{' '}
        <span className="bp-key">
          <span className="bp-key-line" aria-hidden /> {t('bp.keyLine', { value: bpText(high) })}
        </span>
      </figcaption>
    </figure>
  );
}

/** The ESC 2024 home lines, the low line and the very high one, with the user's average marked. */
function Lines({ average }: { average?: BpAverage }) {
  const raised = homeCategories.value.raisedFrom;
  const high = homeCategories.value.highFrom;
  const mine = average ? bpCategory(average) : undefined;
  const rows: Array<{ cat: BpCategory; range: string }> = [
    { cat: 'low', range: t('bp.range.below', { value: bpText(low.value) }) },
    { cat: 'notRaised', range: t('bp.range.below', { value: bpText(raised) }) },
    { cat: 'raised', range: t('bp.range.between', { from: bpText(raised), to: `${high.systolic - 1}/${high.diastolic - 1}` }) },
    { cat: 'high', range: t('bp.range.from', { value: bpText(high) }) },
    { cat: 'veryHigh', range: t('bp.range.from', { value: bpText(veryHigh.value) }) },
  ];
  return (
    <div className="card" data-tour="bp.lines">
      <div className="card-head">
        <h2>{t('bp.linesTitle')}</h2>
        <InfoButton title={t('bp.linesTitle')}>
          <p>{t('bp.linesInfo')}</p>
          <p className="small muted">
            <a href={homeCategories.url} target="_blank" rel="noreferrer">
              {homeCategories.source}
            </a>
          </p>
          <p className="small muted">{homeCategories.note}</p>
          <p className="small muted">
            <a href={veryHigh.url} target="_blank" rel="noreferrer">
              {veryHigh.source}
            </a>
          </p>
          <p className="small muted">
            <a href={low.url} target="_blank" rel="noreferrer">
              {low.source}
            </a>
          </p>
        </InfoButton>
      </div>
      <ul className="plain-list bp-lines">
        {rows.map((r) => (
          <li key={r.cat} className={`bp-lines-row${mine === r.cat ? ' is-mine' : ''}`}>
            <BpChip category={r.cat} />
            <span className="grow small">{r.range}</span>
            {mine === r.cat && <span className="bp-you small">{t('bp.you')}</span>}
          </li>
        ))}
      </ul>
      <p className="muted small">{t('bp.linesNote')}</p>
    </div>
  );
}

function HowToMeasure() {
  const p = homeProtocol.value;
  return (
    <details className="card fold bp-how" data-tour="bp.how">
      <summary>
        <h2 className="grow">{t('bp.howTitle')}</h2>
        <Icon name="down" size={18} />
      </summary>
      <ol className="small fold-body">
        <li>{t('bp.how1')}</li>
        <li>{t('bp.how2', { rest: p.restMinutes })}</li>
        <li>{t('bp.how3', { n: p.perSitting, gap: p.gapMinutes })}</li>
        <li>{t('bp.how4', { days: p.days, min: p.minDays })}</li>
      </ol>
      <p className="small muted">
        <a href={homeProtocol.url} target="_blank" rel="noreferrer">
          {homeProtocol.source}
        </a>
      </p>
    </details>
  );
}

/** What moves it, each line tapping through to where the user's own data on it is. */
function WhatMovesIt() {
  const d = useData();
  const f = d.settings.features;
  const to: Partial<Record<(typeof whatMovesIt.value)[number]['what'], string>> = {
    salt: href('nutrient', 'NA'),
    potassium: href('nutrient', 'K'),
    ...(isOn(f, 'activity') ? { activity: href('activity') } : {}),
    ...(isOn(f, 'weight') ? { weight: href('weight') } : {}),
  };
  return (
    <div className="card">
      <div className="card-head">
        <h2>{t('bp.movesTitle')}</h2>
      </div>
      <ul className="plain-list bp-moves">
        {whatMovesIt.value.map((w) => {
          const link = to[w.what];
          const body = (
            <>
              <strong>{t(`bp.moves.${w.what}` as MessageKey)}</strong> <span className="small">{w.line}</span>
            </>
          );
          return (
            <li key={w.what}>
              {link ? (
                <a className="entry-row" href={link}>
                  <span className="entry-label">{body}</span>
                  <Icon name="chevron" size={16} />
                </a>
              ) : (
                <p className="bp-moves-text">{body}</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="small muted">
        <a href={whatMovesIt.url} target="_blank" rel="noreferrer">
          {whatMovesIt.source}
        </a>
      </p>
    </div>
  );
}

/** Readings by day, each day's in the order taken. */
function bpGroups(readings: readonly BloodPressureReading[]): Map<string, BloodPressureReading[]> {
  const out = new Map<string, BloodPressureReading[]>();
  for (const r of readings) out.set(r.day, [...(out.get(r.day) ?? []), r]);
  return out;
}
