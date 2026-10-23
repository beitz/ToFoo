import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays, daysBetween } from '../../lib/dates';
import { formatRange, presetOf, presetRange, weekStart, type PeriodPreset } from '../../lib/periods';
import { NUTRIENTS } from '../../model/nutrients';
import { periodBreakdown } from '../../model/period';
import type { NutrientResult } from '../../model/simulate';
import { isOn } from '../../settings/features';
import { CompactGauge } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { InfoButton } from '../../ui/InfoButton';
import { Field, Segmented } from '../../ui/controls';
import { urgencyRank } from '../../ui/status';
import { DAY_ICON } from './dayStatus';
import { DateInput } from '../../ui/DateInputs';
import { viewsOf } from '../../settings/views';
import { MacroRings, useToday, type MacroValues } from '../home/TodayRings';
import { CometView } from '../home/NutrientsSection';

const MACRO_ROW = ['ENERCC', 'PROT625', 'FAT', 'CHO', 'FIBT'];
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Full nutrient breakdown for a day, a week, a month or any range (docs/SPEC.md, "Reviewing the past").
 * Route: #/review/<from>/<to>; without dates, the last 7 days.
 */
export function ReviewPage({ from: fromParam, to: toParam }: { from?: string; to?: string }) {
  const d = useData();
  const valid = fromParam && toParam && DAY_KEY.test(fromParam) && DAY_KEY.test(toParam) && fromParam <= toParam;
  const { from, to } = valid ? { from: fromParam, to: toParam > d.today ? d.today : toParam } : presetRange('week', d.today, d.today);
  const preset = presetOf(from, to, d.today);
  const [custom, setCustom] = useState(preset === 'range');
  const impute = isOn(d.settings.features, 'fillUnloggedDays');

  const period = useMemo(
    () => periodBreakdown({ days: d.modelDays, sim: d.model, requirements: d.requirements, imputeUnlogged: impute, from, to }),
    [d.modelDays, d.model, d.requirements, impute, from, to],
  );
  const hidden = new Set(d.settings.hiddenNutrients);
  const macros = MACRO_ROW.map((id) => (hidden.has(id) ? undefined : period.nutrients.get(id))).filter((r): r is NutrientResult => !!r);
  const gauges = NUTRIENTS.filter((n) => !hidden.has(n.id) && !MACRO_ROW.includes(n.id))
    .map((n) => period.nutrients.get(n.id))
    .filter((r): r is NutrientResult => !!r)
    .sort((a, b) => urgencyRank(a.status) - urgencyRank(b.status) || a.value.central - b.value.central);

  // Energy, macros and the list look as on Home (Settings → Appearance); rings show the average per day.
  const views = viewsOf(d.settings);
  const todayValues = useToday();
  const periodValues: MacroValues = {
    ...todayValues,
    amountOf: (id) => period.nutrients.get(id)?.averageIntake ?? 0,
    partOf: (id) => (period.nutrients.get(id)?.missingDataDays ?? 0) > 0,
  };
  const go = (f: string, to2: string) => navigate('review', f, to2);
  // A nutrient opens on this period, not on the usual last days (owner's ask, 2026-10-23).
  const open = (id: string) => navigate('nutrient', id, 'range', from, to);
  function pick(p: PeriodPreset) {
    if (p === 'range') return setCustom(true);
    setCustom(false);
    const r = presetRange(p, to, d.today);
    go(r.from, r.to);
  }
  // Step back or forward by the length of the current range.
  const len = daysBetween(from, to) + 1;
  function step(dir: -1 | 1) {
    if (preset === 'month') {
      const anchor = dir < 0 ? addDays(from, -1) : addDays(to, 1);
      const r = presetRange('month', anchor, d.today);
      return go(r.from, r.to);
    }
    const nextTo = addDays(to, dir * len);
    go(addDays(from, dir * len), nextTo > d.today ? d.today : nextTo);
  }

  const counts = period.statusCounts;
  const parts = (['logged', 'partial', 'fasted', 'unknown', 'filled', 'excluded'] as const).filter((s) => counts[s] > 0);

  return (
    <section>
      <header className="page-head row-between">
        <button className="icon-btn" onClick={() => step(-1)} aria-label={t('review.prev')}>
          <Icon name="back" />
        </button>
        <h1>{formatRange(from, to, d.today)}</h1>
        <button className="icon-btn" disabled={to >= d.today} onClick={() => step(1)} aria-label={t('review.next')}>
          <Icon name="chevron" />
        </button>
      </header>

      <Segmented<PeriodPreset>
        label={t('review.period')}
        value={custom ? 'range' : preset}
        onChange={pick}
        options={[
          { value: 'day', label: t('review.day') },
          { value: 'week', label: t('review.week') },
          { value: 'month', label: t('review.month') },
          { value: 'range', label: t('review.range') },
        ]}
      />
      {custom && (
        <div className="row review-dates">
          <Field label={t('review.from')}>{(id) => <DateInput id={id} value={from} max={to} onChange={(e) => e.target.value && go(e.target.value, to)} />}</Field>
          <Field label={t('review.to')}>{(id) => <DateInput id={id} value={to} min={from} max={d.today} onChange={(e) => e.target.value && go(from, e.target.value)} />}</Field>
        </div>
      )}

      <div className="card review-summary">
        {period.countedDays === 0 ? (
          <p className="small muted grow">{t('review.noDays')}</p>
        ) : (
          <ul className="plain-list review-chips" aria-label={t('review.daysLabel')}>
            {parts.map((s) => (
              <li key={s} className={`day-${s} status-chip`}>
                <Icon name={DAY_ICON[s]} size={14} /> {t(`day.${s}` as MessageKey)} · {counts[s]}
              </li>
            ))}
          </ul>
        )}
        <div className="review-links">
          {from === to && (
            <a className="icon-btn" href={href('diary', from)} aria-label={t('review.openDiary')} title={t('review.openDiary')}>
              <Icon name="diary" size={20} />
            </a>
          )}
          <a className="icon-btn" href={href('week', weekStart(to))} aria-label={t('review.weekByWeek')} title={t('review.weekByWeek')}>
            <Icon name="bars" size={20} />
          </a>
          <a className="icon-btn" href={href('calendar', to.slice(0, 7))} aria-label={t('review.calendar')} title={t('review.calendar')}>
            <Icon name="calendar" size={20} />
          </a>
          <InfoButton title={formatRange(from, to, d.today)} label={t('review.aboutNumbers')}>
            <p>{period.countedDays === 0 ? t('review.noDays') : t(period.countedDays === 1 ? 'review.countedOne' : 'review.counted', { n: period.countedDays })}</p>
            <p>{t(impute ? 'review.hintFilled' : 'review.hint')}</p>
            <p>{t('review.explain')}</p>
            <p>{t('review.tapHint')}</p>
          </InfoButton>
        </div>
      </div>

      {macros.length > 0 &&
        (views.macros === 'rings' ? (
          <div className="card home-card">
            <MacroRings values={periodValues} defaultBased={() => false} today={false} open={open} />
          </div>
        ) : (
          <div className="macro-row" role="group" aria-label={t('home.macros')}>
            {macros.map((r) => (
              <CompactGauge key={r.id} variant="cell" result={r} onClick={() => open(r.id)} />
            ))}
          </div>
        ))}
      {views.nutrients === 'comets' ? (
        <div className="card home-card">
          <CometView results={gauges} showRange={isOn(d.settings.features, 'uncertaintyRanges')} open={open} />
        </div>
      ) : (
        <div className="cgauge-grid">
          {gauges.map((r) => (
            <CompactGauge key={r.id} result={r} onClick={() => open(r.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
