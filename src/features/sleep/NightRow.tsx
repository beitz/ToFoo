import { useMemo } from 'react';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { addDays, dayKey, formatTime, parseDay, weekdayShort } from '../../lib/dates';
import { daylight } from '../../logic/daylight';
import { minuteOfDay, type Night } from '../../logic/nights';
import { SLEEP_DAY_START_HOUR, type SleepBlock } from '../../logic/sleep';
import { clockText, hmShort, hmText, signedHm } from './format';

/**
 * The "When you slept" rows, shared by the sleep page (#/nights) and its day-by-day page
 * (#/nights/days). The axis runs from 18:00 the evening before (where a sleep day starts, see
 * SLEEP_DAY_START_HOUR) to 12:00 (18 hours), and on to the end of the latest sleep shown (up to 18:00,
 * where the next day takes over), so a nap in the afternoon fits on its row.
 */
const AXIS_START_MIN = SLEEP_DAY_START_HOUR * 60;
const AXIS_MIN = 18 * 60;
const AXIS_MAX_MIN = 24 * 60;

/** Hours with a label: every 2 hours from the start, short of the right end (the bar is the card's full width, so they fit at 360 px even on the longest axis). Midnight is always one of them. */
function axisTicks(len: number): number[] {
  const step = 2 * 60;
  const out: number[] = [];
  for (let m = step; m <= len - 60; m += step) out.push(m);
  return out;
}

/** Every whole hour inside the axis gets a faint guide line; labelled hours a clearer one. */
function hourLines(len: number): Array<{ m: number; kind: 'hour' | 'label' | 'midnight' }> {
  const labels = new Set(axisTicks(len));
  const out: Array<{ m: number; kind: 'hour' | 'label' | 'midnight' }> = [];
  for (let m = 60; m < len; m += 60) out.push({ m, kind: (m + AXIS_START_MIN) % 1440 === 0 ? 'midnight' : labels.has(m) ? 'label' : 'hour' });
  return out;
}

/** "22", "0", "6": just the hour, the grid says the rest. */
const hourText = (m: number) => String(Math.floor(((m + AXIS_START_MIN) % 1440) / 60));

/** "Wed 21": the month is in the window's dates already, and the rows are narrow. */
export const dayLabel = (day: string) => `${weekdayShort(day)} ${parseDay(day).getDate()}`;

/** Minutes from the axis start (18:00 the evening before `day`) to `t`, by the clock, so a night with a clock change still lines up with the ticks. */
function axisMinute(t: number, day: string): number {
  const k = dayKey(new Date(t));
  const base = k === day ? 1440 : k === addDays(day, -1) ? 0 : k < day ? -Infinity : Infinity;
  return base + minuteOfDay(t) - AXIS_START_MIN;
}

/** The axis length: to 12:00, or on to the end of the latest sleep, a whole hour, up to 18:00. */
export function axisLength(nights: readonly Night[]): number {
  let len = AXIS_MIN;
  for (const n of nights) for (const b of [...(n.block ? [n.block] : []), ...n.naps]) len = Math.max(len, Math.ceil(axisMinute(b.end, n.day) / 60) * 60);
  return Math.min(len, AXIS_MAX_MIN);
}

/** The clock times above the rows, lined up with their tracks. */
export function NightAxis({ axisLen }: { axisLen: number }) {
  return (
    <div className="nights-axis" aria-hidden>
      <span className="nights-axis-ticks">
        {axisTicks(axisLen).map((m) => (
          <span key={m} style={{ left: `${(m / axisLen) * 100}%` }}>
            {hourText(m)}
          </span>
        ))}
      </span>
    </div>
  );
}

/** What the marks on the rows mean. */
export function NightLegend({ usual }: { usual?: { bed: number; wake: number } }) {
  return (
    <p className="nights-legend small muted">
      <span>
        <span className="nights-key nights-key-sleep" /> {t('nights.keyAsleep')}
      </span>
      {usual && (
        <span>
          <span className="nights-key nights-key-usual" /> {t('nights.keyUsual', { from: clockText(usual.bed), to: clockText(usual.wake) })}
        </span>
      )}
      <span>
        <span className="nights-key-meal">◆</span> {t('nights.keyMeal')}
      </span>
      <span>
        <span className="nights-key nights-key-unknown" /> {t('nights.keyUnknown')}
      </span>
      <span>
        <span className="nights-key nights-key-day" /> {t('nights.keyDaylight')}
      </span>
    </p>
  );
}

/** Each sleep of a block on its own, oldest first: parts that overlap are joined, so the times read as when you were asleep. */
function stretches(b: SleepBlock): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const p of [...b.parts].sort((x, y) => x.start - y.start)) {
    const last = out[out.length - 1];
    if (last && p.start <= last.end) last.end = Math.max(last.end, p.end);
    else out.push({ start: p.start, end: p.end });
  }
  return out;
}

/** "21:12–02:40, 03:05–06:30 · nap 13:10–14:00": the times under a row on the day-by-day page. */
function SleepTimes({ night: n }: { night: Night }) {
  const night = n.block ? stretches(n.block) : [];
  const naps = n.naps.flatMap(stretches);
  // An unlogged day says so on the right already.
  if (!night.length && !naps.length) return null;
  return (
    <span className="nights-times small">
      {night.map((s) => (
        <span key={s.start}>
          {formatTime(s.start)}–{formatTime(s.end)}
        </span>
      ))}
      {naps.map((s) => (
        <span key={s.start} className="muted">
          {t('nights.timesNap', { from: formatTime(s.start), to: formatTime(s.end) })}
        </span>
      ))}
    </span>
  );
}

/**
 * One day on the 18:00 → 12:00 (or later) axis: the usual window, each sleep and nap, the last meal
 * before the night, the total on the right. With `times`, the clock times of each sleep under the bar.
 */
export function NightRow({ night: n, axisLen, latitude, usual, lastMeal, times, label = dayLabel(n.day) }: { night: Night; axisLen: number; latitude: number; usual?: { bed: number; wake: number }; lastMeal?: number; times?: boolean; label?: string }) {
  const pos = (t: number) => (Math.max(0, Math.min(axisLen, axisMinute(t, n.day))) / axisLen) * 100;
  // When the sun was up, the evening before and on the day itself, behind the sleep.
  const sunUp = useMemo(() => [...daylight(addDays(n.day, -1), latitude), ...daylight(n.day, latitude)], [n.day, latitude]);
  const lines = useMemo(() => hourLines(axisLen), [axisLen]);
  // A clock time on the row: evening times on the day before, the rest on the day itself.
  const minutePos = (m: number) => ((m >= AXIS_START_MIN ? m - AXIS_START_MIN : m + 1440 - AXIS_START_MIN) / axisLen) * 100;
  const night = n.block ? stretches(n.block) : [];
  const naps = n.naps.map((b) => t('nights.rowNap', { from: formatTime(b.start), to: formatTime(b.end) })).join(', ');
  // A night woken from several times reads each stretch; one stretch reads as before.
  const spokenTimes = night.length > 1 ? `, ${t('nights.rowParts', { parts: night.map((s) => t('nights.rowPart', { from: formatTime(s.start), to: formatTime(s.end) })).join(', ') })}` : '';
  const spoken =
    (n.asleep === undefined
      ? t('nights.rowUnknown', { day: label })
      : t('nights.rowSpoken', {
          day: label,
          from: formatTime(n.block!.start),
          to: formatTime(n.block!.end),
          hm: hmText(n.asleep),
          diff: signedHm(n.diff!),
        }) + spokenTimes) +
    (naps ? `, ${naps}` : '') +
    (lastMeal ? `, ${t('nights.rowMeal', { time: formatTime(lastMeal) })}` : '');
  const parts = [...(n.block?.parts ?? []), ...n.naps.flatMap((b) => b.parts)];
  return (
    <a className={`nights-row${times ? ' has-times' : ''}`} href={href('diary', n.day)} aria-label={spoken}>
      <span className="nights-day small" aria-hidden>
        {label}
      </span>
      <span className="nights-track" aria-hidden>
        <span className="nights-shade">
          {sunUp.map((s) => {
            const a = pos(s.start);
            const b = pos(s.end);
            return b > a ? <span key={s.start} className="nights-daylight" style={{ left: `${a}%`, width: `${b - a}%` }} /> : null;
          })}
          {lines.map(({ m, kind }) => (
            <span key={m} className={`nights-grid is-${kind}`} style={{ left: `${(m / axisLen) * 100}%` }} />
          ))}
        </span>
        {usual && <span className="nights-usual" style={{ left: `${minutePos(usual.bed)}%`, width: `${Math.max(0, minutePos(usual.wake) - minutePos(usual.bed))}%` }} />}
        {!n.block && usual && <span className="nights-unknown" style={{ left: `${minutePos(usual.bed)}%`, width: `${Math.max(0, minutePos(usual.wake) - minutePos(usual.bed))}%` }} />}
        {parts.map((p) => {
          const a = pos(p.start);
          return <span key={p.id} className="nights-sleep" style={{ left: `${a}%`, width: `${Math.max(1, pos(p.end) - a)}%` }} />;
        })}
        {lastMeal !== undefined && (
          <span className="nights-meal" style={{ left: `${pos(lastMeal)}%` }}>
            ◆
          </span>
        )}
      </span>
      <span className="nights-total" aria-hidden>
        {n.asleep === undefined ? (
          <>
            <strong>?</strong>
            <span className="small muted">{t('nights.unknown')}</span>
          </>
        ) : (
          <>
            <strong>{hmShort(n.asleep)}</strong>
            <span className={`small nights-diff ${n.diff! < 0 ? 'is-short' : 'is-over'}`}>{signedHm(n.diff!)}</span>
          </>
        )}
      </span>
      {times && (
        <span aria-hidden className="nights-times-cell">
          <SleepTimes night={n} />
        </span>
      )}
    </a>
  );
}
