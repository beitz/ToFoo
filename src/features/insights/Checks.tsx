import { href } from '../../app/router';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { fmtChance, fmtMeasure, type Check } from '../../ai/insights';
import { formatDay } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { MEASURE_BY_ID, type Stats } from '../../logic/insights';
import { describeConditions, verdict } from './describe';

const pctText = (yes: number, known: number) => (known ? ` (${Math.round((100 * yes) / known)} %)` : '');

/**
 * The comparisons behind a pattern answer, with the app's own numbers and the days they rest on.
 * `onLeave` runs before a day chip opens the diary (so back can return to the chat).
 */
export function Checks({ checks, onLeave }: { checks: Check[]; onLeave?: () => void }) {
  return (
    <details className="card insights-checks">
      <summary>{t('insights.checks', { n: checks.length })}</summary>
      <ul className="plain-list">
        {checks.map((c, i) => (
          <li key={i} className="insights-check">
            {c.kind === 'count' ? <CountCheck check={c} onLeave={onLeave} /> : <CompareCheck check={c} />}
          </li>
        ))}
      </ul>
    </details>
  );
}

function CountCheck({ check, onLeave }: { check: Extract<Check, { kind: 'count' }>; onLeave?: () => void }) {
  const d = useData();
  const r = check.result;
  const hasGroup = check.group.length > 0;
  const leftOut = r.days - r.group.known - r.others.known;
  return (
    <>
      <p className="insights-check-title">
        {hasGroup ? describeConditions(check.group) : t('insights.allDays')} → {describeConditions(check.outcome)}
      </p>
      <p className="small">
        {hasGroup ? t('insights.countGroup', { yes: r.group.yes, known: r.group.known, pct: pctText(r.group.yes, r.group.known) }) : t('insights.countAll', { yes: r.group.yes, known: r.group.known, pct: pctText(r.group.yes, r.group.known) })}
        {hasGroup && (
          <>
            <br />
            {t('insights.countOthers', { yes: r.others.yes, known: r.others.known, pct: pctText(r.others.yes, r.others.known) })}
          </>
        )}
      </p>
      {r.chance !== undefined && (
        <p className="small" title={t('insights.chanceHelp')}>
          {t('insights.chance', { p: fmtChance(r.chance), verdict: verdict(r.chance) })}
        </p>
      )}
      {leftOut > 0 && <p className="muted small">{t('insights.leftOut', { n: leftOut })}</p>}
      {r.groupDays.length > 0 && (
        <ul className="plain-list row wrap insights-days">
          {r.groupDays.map((g) => {
            const outcome = t(g.outcome === null ? 'insights.dayUnknown' : g.outcome ? 'insights.dayYes' : 'insights.dayNo');
            return (
              <li key={g.day}>
                <a className={`status-chip insights-day${g.outcome ? ' insights-day-yes' : ''}`} href={href('diary', g.day)} onClick={onLeave} aria-label={t('insights.showDay', { day: formatDay(g.day, d.today), outcome })}>
                  {/* The mark carries the meaning, not the colour. */}
                  <span aria-hidden="true">{g.outcome === null ? '?' : g.outcome ? '✓' : '–'}</span> {formatDay(g.day, d.today)}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function statsShort(id: string, s: Stats | undefined): string {
  return s ? fmtMeasure(id, s.mean) : t('insights.noData');
}

function CompareCheck({ check }: { check: Extract<Check, { kind: 'compare' }> }) {
  const hasGroup = check.group.length > 0;
  return (
    <>
      <p className="insights-check-title">{describeConditions(check.group)}</p>
      <ul className="plain-list small">
        {check.result.measures.map((m) => {
          const name = MEASURE_BY_ID.get(m.measure)?.name ?? m.measure;
          const minimum = (m.group?.minimumDays ?? 0) + (m.others?.minimumDays ?? 0);
          return (
            <li key={m.measure}>
              <strong>{name}</strong>:{' '}
              {hasGroup ? (
                <>
                  {t('insights.measureGroup', { v: statsShort(m.measure, m.group), n: m.group?.n ?? 0 })} · {t('insights.measureOthers', { v: statsShort(m.measure, m.others), n: m.others?.n ?? 0 })}
                  {m.chance !== undefined && (
                    <>
                      <br />
                      <span title={t('insights.chanceHelp')}>{t('insights.chance', { p: fmtChance(m.chance), verdict: verdict(m.chance) })}</span>
                    </>
                  )}
                </>
              ) : m.group ? (
                t('insights.measureAll', { v: fmtMeasure(m.measure, m.group.mean), min: fmtMeasure(m.measure, m.group.min), max: fmtMeasure(m.measure, m.group.max), n: fmtNumber(m.group.n) })
              ) : (
                t('insights.noData')
              )}
              {minimum > 0 && <span className="muted"> · {t('insights.minimum', { n: minimum })}</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
