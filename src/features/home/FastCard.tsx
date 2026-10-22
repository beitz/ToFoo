import { useData } from '../../app/data';
import { href } from '../../app/router';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { dayKey, formatDay, formatTime } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { endFast } from '../fast/fastActions';
import { KetosisChart } from '../fast/KetosisChart';
import { useFast } from '../fast/useFast';

/** "34 h 33 min": hours and minutes for the running clock. */
export function fmtClock(hours: number): string {
  const total = Math.max(0, Math.floor(hours * 60));
  return t('fast.clock', { h: Math.floor(total / 60), m: total % 60 });
}

/**
 * The running fast on Home (owner's pick, 2026-10-22): the clock since the last meal, the ketosis
 * curve when that estimate is on, and End fast. No phase, no readings here; the fast page has the
 * rest.
 */
export function FastCard() {
  const d = useData();
  const toast = useToast();
  const f = useFast();
  if (!f) return null;
  const since = f.clock.fromMeal
    ? t('fast.cardSinceMeal', { day: formatDay(dayKey(new Date(f.clock.since)), d.today), time: formatTime(f.clock.since) })
    : t('fast.cardSinceStart', { day: formatDay(f.fast.startDay, d.today) });
  return (
    <div className="card home-card fast-card" id="fast-card">
      <div className="fast-card-top">
        <a className="fast-card-clock" href={href('fasting')}>
          <span className="muted small">{since}</span>
          <strong>{fmtClock(f.input.hours)}</strong>
        </a>
        <button className="btn btn-secondary" onClick={() => void endFast(f.fast, d.today, toast)}>
          {t('home.endFast')}
        </button>
      </div>
      {f.estimate && (
        <a className="fast-card-chart" href={href('fasting')} aria-label={t('fast.openCurve')}>
          <KetosisChart input={f.input} />
        </a>
      )}
      <a className="fast-card-more small" href={href('fasting')}>
        {t('fast.more')} <Icon name="chevron" size={14} />
      </a>
    </div>
  );
}

/** The header chip while a fast runs: the clock; tap to bring the fasting card into view. */
export function FastChip() {
  const f = useFast();
  if (!f) return null;
  return (
    <button
      type="button"
      className="fast-chip"
      onClick={() => document.getElementById('fast-card')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}
      aria-label={t('fast.chipSpoken', { time: fmtClock(f.input.hours) })}
    >
      <Icon name="hourglass" size={16} />
      {t('fast.hours', { h: Math.floor(f.input.hours) })}
    </button>
  );
}
