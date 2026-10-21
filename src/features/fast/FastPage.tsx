import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { formatDay, formatTime, dayKey } from '../../lib/dates';
import type { KetosisFactor } from '../../model/ketosis';
import type { Cited, Confidence } from '../../model/paramTypes';
import { ketosis } from '../../../model/parameters';
import { Icon } from '../../ui/Icon';
import { KetosisChart } from './KetosisChart';
import { fmtBhbRange, fmtFastDuration, PHASE_KEY, useFast } from './useFast';
import { BackButton } from '../../ui/BackButton';

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
  }
}

/** #/fasting: the running fast, with the ketosis estimate when that module is on (docs/SPEC.md, "Ketosis estimate during fasts"). */
export function FastPage() {
  const d = useData();
  const f = useFast();

  return (
    <section>
      <header className="page-head row">
        <BackButton />
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
              <KetosisChart input={f.input} />
              <p className="muted small">{t('fast.chart.caption')}</p>

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
    </section>
  );
}
