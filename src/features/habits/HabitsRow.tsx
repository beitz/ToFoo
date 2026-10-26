import { useRef, useState, type ReactNode } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { weekStart } from '../../lib/periods';
import { habitDay, habitWeek, isDue, type HabitData } from '../../logic/habits';
import type { Habit } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { HabitActivitySheet, markText, MarkGlyph, habitStyle, quickText, useAnswer, useQuickLog } from './HabitParts';
import { useHabits } from './useHabits';

/**
 * Today's habits on Home (owner's design, 2026-10-26): one small card per habit in a row that scrolls
 * sideways, and "All" fixed at its end for the habits page. A tap answers a do or avoid habit for today
 * (done, or had some; a second tap clears it), with undo; a minutes habit opens the activity sheet,
 * or with "One tap logs it" logs its activity at once (each tap one more, with undo; owner's ask
 * 2026-10-26, a walk to work and back) and opens the sheet on a long press.
 * With Habits on and none made yet, the row still shows, with a card that adds the first one, so the
 * switch in Settings leads somewhere (owner's ask, 2026-10-26).
 */
export function HabitsRow() {
  const d = useData();
  const habits = useHabits();
  const answer = useAnswer();
  const quickLog = useQuickLog();
  const [logging, setLogging] = useState<Habit>();
  const press = useLongPress((h) => setLogging(h));
  if (!habits) return null;
  if (!habits.active.length)
    return (
      <div className="habits-row" data-tour="home.habits">
        <a className="habit-card habit-card-add" href={href('habits', 'new')}>
          <Icon name="plus" size={18} /> {t('habits.addFirst')}
        </a>
        <a className="habits-all" href={href('habits')} aria-label={t('habits.all')}>
          <Icon name="repeat" size={18} />
          <span aria-hidden>{t('habits.allShort')}</span>
        </a>
      </div>
    );
  const { data } = habits;
  // Habits not due today go to the end; one without a target is never due but always there to tap.
  const later = (h: Habit) => Number(h.goal.type !== 'none' && !isDue(h.goal, d.today));
  const shown = [...habits.active].sort((a, b) => later(a) - later(b));

  const tap = (h: Habit) => {
    if (press.fired()) return;
    if (h.kind === 'minutes') return h.quick ? void quickLog(h) : setLogging(h);
    const did = data.answers.get(h.id)?.get(d.today);
    void answer(h, d.today, did === undefined ? true : null);
  };

  return (
    <div className="habits-row" data-tour="home.habits">
      <div className="habits-scroll" role="list" aria-label={t('habits.title')}>
        {shown.map((h) => {
          const v = cardValue(h, data);
          return (
            <button
              key={h.id}
              role="listitem"
              className={v.dim ? 'habit-card dim' : 'habit-card'}
              style={habitStyle(h)}
              onClick={() => tap(h)}
              {...(h.kind === 'minutes' && h.quick ? press.handlers(h) : {})}
              aria-label={`${h.name}: ${v.spoken}${h.quick ? `; ${t('habits.spoken.quick', { what: quickText(h.quick) })}` : ''}`}
            >
              <span className="habit-card-name" aria-hidden>
                {h.name}
              </span>
              <span className="habit-card-value" aria-hidden>
                {v.text}
              </span>
            </button>
          );
        })}
      </div>
      <a className="habits-all" href={href('habits')} aria-label={t('habits.all')}>
        <Icon name="repeat" size={18} />
        <span aria-hidden>{t('habits.allShort')}</span>
      </a>
      {logging && <HabitActivitySheet habit={logging} day={d.today} onClose={() => setLogging(undefined)} />}
    </div>
  );
}

const LONG_PRESS_MS = 450;

/**
 * Long press on a card: after under half a second (before Android's own long-press menu) the action runs and the click that follows is swallowed.
 * The context menu a long press opens on Android is turned off for these cards only.
 */
function useLongPress(action: (h: Habit) => void) {
  const timer = useRef<number>(undefined);
  const done = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);
  return {
    handlers: (h: Habit) => ({
      onPointerDown: () => {
        done.current = false;
        cancel();
        timer.current = window.setTimeout(() => {
          done.current = true;
          action(h);
        }, LONG_PRESS_MS);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    }),
    /** Whether the click now arriving ends a long press (then it does nothing). */
    fired: () => {
      const was = done.current;
      done.current = false;
      return was;
    },
  };
}

/** What a card shows: today's mark, or the week's count for a weekly goal, or today's minutes. */
function cardValue(h: Habit, data: HabitData): { text: ReactNode; spoken: string; dim: boolean } {
  const today = habitDay(h, data.today, data);
  // No target: today's minutes, or done / not yet (an empty ring, never greyed as "not due").
  if (h.goal.type === 'none') {
    if (h.kind === 'minutes') return { text: `${today.minutes ?? 0}′`, spoken: t('habits.spoken.minutesToday', { m: today.minutes ?? 0 }), dim: false };
    const mark = today.mark === 'off' ? 'open' : today.mark;
    return { text: <MarkGlyph mark={mark} />, spoken: markText(h, mark), dim: false };
  }
  if (h.goal.type === 'perWeek') {
    const w = habitWeek(h, weekStart(data.today), data);
    const done = today.mark === 'kept' ? <MarkGlyph mark="kept" /> : null;
    if (h.kind === 'avoid')
      return { text: t('habits.card.max', { n: w.count, max: w.of }), spoken: t('habits.spoken.max', { n: w.count, max: w.of }), dim: false };
    return {
      text: (
        <>
          {done} {w.count}/{w.of}
        </>
      ),
      spoken: `${t('habits.spoken.week', { n: w.count, of: w.of })}${today.mark === 'kept' ? `, ${markText(h, 'kept')}` : ''}`,
      dim: false,
    };
  }
  if (h.kind === 'minutes' && today.mark !== 'kept' && today.mark !== 'off')
    return { text: `${today.minutes ?? 0}/${h.minutes}′`, spoken: t('habits.spoken.minutes', { m: today.minutes ?? 0, of: h.minutes ?? 0 }), dim: false };
  return { text: <MarkGlyph mark={today.mark} />, spoken: markText(h, today.mark), dim: today.mark === 'off' };
}
