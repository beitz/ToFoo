import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { daysBetween, formatDate } from '../../lib/dates';
import { formatMonth } from '../../lib/periods';
import { lastMealBefore, nightsWindow, nightTimes } from '../../logic/nights';
import { sleepNeed } from '../../../model/parameters';
import { BackButton } from '../../ui/BackButton';
import { useSleepNeed } from '../settings/SleepNeed';
import { hmText } from './format';
import { axisLength, NightAxis, NightLegend, NightRow } from './NightRow';
import { useSleep } from './useSleep';

/** Days added each time the list reaches its end. */
const STEP = 21;

/**
 * Every day's sleep, newest first, back to the first logged sleep (owner's ask 2026-11-03, from
 * "When you slept" on #/nights; route #/nights/days): the same rows as the sleep page with the clock
 * times of each sleep under the bar and the total on the right. More days load as the list is
 * scrolled to its end. The usual window is that of the sleep page's default window, so the pale band
 * means the same on both pages.
 */
export function SleepDaysPage() {
  const d = useData();
  const records = useSleep();
  const need = useSleepNeed();
  const [shown, setShown] = useState(STEP);
  const end = useRef<HTMLLIElement>(null);

  const first = useMemo(() => (records ?? []).reduce<string | undefined>((m, r) => (m === undefined || r.day < m ? r.day : m), undefined), [records]);
  // Every day from the first logged sleep to last night, oldest first; nightsWindow decides where "last night" is.
  const all = useMemo(() => (first ? nightsWindow(records ?? [], d.today, Math.max(1, daysBetween(first, d.today) + 1), need.minutes).filter((n) => n.day >= first) : []), [records, first, d.today, need.minutes]);
  const days = useMemo(() => all.slice(-shown).reverse(), [all, shown]);
  const axisLen = useMemo(() => axisLength(all), [all]);
  const times = useMemo(() => nightTimes(all.slice(-sleepNeed.windowNights.value)), [all]);
  const usual = times.bed && times.wake ? { bed: times.bed.median, wake: times.wake.median } : undefined;
  const mealStarts = useMemo(() => d.model.meals.map((m) => m.start), [d.model.meals]);
  const more = shown < all.length;

  // Load the next days a little before the end of the list comes into view.
  useEffect(() => {
    const el = end.current;
    if (!el || !more || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setShown((n) => n + STEP), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, shown]);

  return (
    <section>
      <header className="page-head row">
        <BackButton to={['nights']} />
        <h1 className="grow">{t('nights.daysTitle')}</h1>
      </header>
      {records && all.length === 0 ? (
        <div className="card">
          <p>{t('nights.daysNone')}</p>
          <p className="muted small">{t('nights.noneHint')}</p>
        </div>
      ) : (
        <>
          <p className="muted small">{t('nights.daysIntro', { need: hmText(need.minutes) })}</p>
          <div className="card nights-days">
            <NightLegend usual={usual} />
            <div className="nights-days-axis">
              <NightAxis axisLen={axisLen} />
            </div>
            <ol className="plain-list nights-rows">
              {days.map((n, i) => {
                const month = n.day.slice(0, 7);
                return (
                  <Fragment key={n.day}>
                    {(i === 0 || days[i - 1]!.day.slice(0, 7) !== month) && (
                      <li className="nights-month small">
                        {formatMonth(month)}
                      </li>
                    )}
                    <li>
                      <NightRow night={n} axisLen={axisLen} usual={usual} lastMeal={n.block ? lastMealBefore(mealStarts, n.block.start) : undefined} times />
                    </li>
                  </Fragment>
                );
              })}
              <li ref={end} className="nights-days-end">
                {more ? (
                  <button type="button" className="btn" onClick={() => setShown((n) => n + STEP)}>
                    {t('nights.daysMore')}
                  </button>
                ) : (
                  first && <p className="small muted">{t('nights.daysStart', { date: formatDate(first) })}</p>
                )}
              </li>
            </ol>
          </div>
        </>
      )}
    </section>
  );
}
