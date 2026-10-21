import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { formatDay, formatTime, dayKey } from '../../lib/dates';
import type { KetosisFactor } from '../../model/ketosis';
import type { Cited, Confidence } from '../../model/paramTypes';
import { ketosis } from '../../../model/parameters';
import { Icon } from '../../ui/Icon';
import { KetosisChart } from './KetosisChart';
import { KetoneSheet } from './KetoneSheet';
import { agoText, KETONE_TYPE_KEY, ketoneValueText } from './ketoneFormat';
import type { KetoneReading } from '../../storage/types';
import { fmtBhbRange, fmtFastDuration, PHASE_KEY, useFast } from './useFast';

/** Every number the estimate uses, with its source and confidence, generated from model/parameters.ts. */
const SOURCE_ROWS: ReadonlyArray<readonly [keyof typeof ketosis, MessageKey]> = [
  ['curve', 'fast.src.curve'],
  ['personSpreadHours', 'fast.src.personSpreadHours'],
  ['personLevelCv', 'fast.src.personLevelCv'],
  ['lowCarbShiftHours', 'fast.src.lowCarbShiftHours'],
  ['carbShareSpan', 'fast.src.carbShareSpan'],
  ['exerciseShiftHours', 'fast.src.exerciseShiftHours'],
  ['exerciseMinMinutes', 'fast.src.exerciseMinMinutes'],
  ['femaleRiseFactor', 'fast.src.femaleRiseFactor'],
  ['obeseRiseFactor', 'fast.src.obeseRiseFactor'],
  ['phases', 'fast.src.phases'],
  ['personal', 'fast.src.personal'],
  ['meterMaxMmol', 'fast.src.meterMaxMmol'],
  ['highNoteMmol', 'fast.src.highNoteMmol'],
];

const CONFIDENCE_KEY: Record<Confidence, MessageKey> = {
  high: 'fast.conf.high',
  medium: 'fast.conf.medium',
  low: 'fast.conf.low',
  assumption: 'fast.conf.assumption',
};

function factorText(f: KetosisFactor): string {
  switch (f.kind) {
    case 'lowCarb':
      return t('fast.factor.lowCarb', { pct: Math.round(f.carbShare * 100) });
    case 'carbUnknown':
      return t('fast.factor.carbUnknown');
    case 'exercise':
      return t('fast.factor.exercise', { min: f.minutes });
    case 'female':
      return t('fast.factor.female');
    case 'sexUnknown':
      return t('fast.factor.sexUnknown');
    case 'bmi':
      return t('fast.factor.bmi', { bmi: f.bmi.toFixed(1) });
    case 'bmiUnknown':
      return t('fast.factor.bmiUnknown');
    case 'personal':
      return t(f.hours >= 0 ? 'fast.factor.personalEarlier' : 'fast.factor.personalLater', { h: Math.abs(Math.round(f.hours)), n: f.readings });
  }
}

/** #/fasting: the running fast, with the ketosis estimate when that module is on (docs/SPEC.md, "Ketosis estimate during fasts"). */
export function FastPage() {
  const d = useData();
  const f = useFast();
  const [sheet, setSheet] = useState<{ reading?: KetoneReading } | null>(null);
  const latest = f?.readings[f.readings.length - 1];
  const high = f?.readings.some((r) => r.type === 'blood' && r.value > ketosis.highNoteMmol.value);
  const dots = f ? f.readings.filter((r) => r.type === 'blood').map((r) => ({ hours: (r.time - f.clock.since) / 3_600_000, mmol: Math.min(r.value, ketosis.meterMaxMmol.value * 2) })) : [];

  return (
    <section>
      <header className="page-head row">
        <a className="icon-btn" href={href()} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{t('fast.title')}</h1>
      </header>

      {!f ? (
        <p className="muted">{t('fast.notFasting')}</p>
      ) : (
        <>
          <div className="card">
            <p className="fast-hours">{fmtFastDuration(f.input.hours)}</p>
            <p className="muted small">
              {f.clock.fromMeal
                ? t('fast.sinceMeal', { day: formatDay(dayKey(new Date(f.clock.since)), d.today), time: formatTime(f.clock.since) })
                : t('fast.sinceStart', { day: formatDay(f.fast.startDay, d.today) })}
            </p>
          </div>

          {f.estimate ? (
            <div className="card">
              <h2 className="fast-phase">{t(PHASE_KEY[f.estimate.phase])}</h2>
              <p>
                {t('fast.bhbNow', { range: fmtBhbRange(f.estimate.bhb.low, f.estimate.bhb.high) })}
              </p>
              {latest && (
                <p className="fast-measured">
                  {t('fast.measured', { value: ketoneValueText(latest), type: t(KETONE_TYPE_KEY[latest.type]), ago: agoText(latest.time, f.now) })}
                </p>
              )}
              {high && (
                <p className="notice small" role="alert">
                  {t('fast.highNote', { v: ketosis.highNoteMmol.value })}
                </p>
              )}
              <KetosisChart input={f.input} dots={dots} />
              <p className="muted small">{t('fast.chart.caption')}</p>

              <h3 className="fast-sub">{t('fast.measureTitle')}</h3>
              {f.readings.length > 0 && (
                <ul className="plain-list fast-readings">
                  {[...f.readings].reverse().map((r) => (
                    <li key={r.id}>
                      <button className="entry-row" onClick={() => setSheet({ reading: r })}>
                        <span>
                          {formatDay(r.day, d.today)}, {formatTime(r.time)} · {t(KETONE_TYPE_KEY[r.type])}
                        </span>
                        <strong>{ketoneValueText(r)}</strong>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button className="btn" onClick={() => setSheet({})}>
                <Icon name="plus" size={18} /> {t('fast.addMeasurement')}
              </button>
              {!f.input.personal && <p className="muted small">{t('fast.personalHint', { n: ketosis.personal.value.minReadings })}</p>}

              <h3 className="fast-sub">{t('fast.movedTitle')}</h3>
              <ul className="fast-factors">
                {f.estimate.factors.map((x) => (
                  <li key={x.kind}>{factorText(x)}</li>
                ))}
                {f.estimate.factors.length === 0 && <li>{t('fast.factor.none')}</li>}
                <li>{t('fast.factor.people', { h: Math.round(ketosis.personSpreadHours.value * ketosis.personSpreadSd.value), pct: Math.round(ketosis.personLevelCv.value * 100) })}</li>
              </ul>

              <details className="fast-guide">
                <summary>
                  <Icon name="info" size={16} /> {t('fast.guideTitle')}
                </summary>
                <p>{t('fast.guide.bhb')}</p>
                <p>{t('fast.guide.phases')}</p>
                <p>{t('fast.guide.uncertain')}</p>
                <p>{t('fast.guide.measure')}</p>
                <p>{t('fast.guide.safety')}</p>
                <h3 className="fast-sub">{t('fast.sourcesTitle')}</h3>
                <ul className="fast-sources small">
                  {SOURCE_ROWS.map(([key, label]) => {
                    const p: Cited = ketosis[key];
                    return (
                      <li key={key}>
                        <strong>{t(label)}</strong> ({t(CONFIDENCE_KEY[p.confidence])}): {p.source}
                        {p.note && <span className="muted"> {p.note}</span>}
                      </li>
                    );
                  })}
                </ul>
              </details>
            </div>
          ) : (
            <div className="card">
              <p>{t('fast.ketosisOff')}</p>
              <a className="btn" href={href('settings')}>
                {t('fast.openSettings')}
              </a>
            </div>
          )}
        </>
      )}
      {sheet && <KetoneSheet reading={sheet.reading} onClose={() => setSheet(null)} />}
    </section>
  );
}
