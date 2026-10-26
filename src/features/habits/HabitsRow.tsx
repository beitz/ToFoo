import { useState, type ReactNode } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { weekStart } from '../../lib/periods';
import { habitDay, habitWeek, isDue, type HabitData } from '../../logic/habits';
import type { Habit } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { HabitActivitySheet, markText, MarkGlyph, habitStyle, useAnswer } from './HabitParts';
import { useHabits } from './useHabits';

/**
 * Today's habits on Home (owner's design, 2026-10-26): one small card per habit in a row that scrolls
 * sideways, and "All" fixed at its end for the habits page. A tap answers a do or avoid habit for today
 * (done, or had some; a second tap clears it), with undo; a minutes habit opens the activity sheet.
 */
export function HabitsRow() {
  const d = useData();
  const habits = useHabits();
  const answer = useAnswer();
  const [logging, setLogging] = useState<Habit>();
  if (!habits?.active.length) return null;
  const { data } = habits;
  // Habits not due today go to the end.
  const shown = [...habits.active].sort((a, b) => Number(!isDue(a.goal, d.today)) - Number(!isDue(b.goal, d.today)));

  const tap = (h: Habit) => {
    if (h.kind === 'minutes') return setLogging(h);
    const did = data.answers.get(h.id)?.get(d.today);
    void answer(h, d.today, did === undefined ? true : null);
  };

  return (
    <div className="habits-row" data-tour="home.habits">
      <div className="habits-scroll" role="list" aria-label={t('habits.title')}>
        {shown.map((h) => {
          const v = cardValue(h, data);
          return (
            <button key={h.id} role="listitem" className={v.dim ? 'habit-card dim' : 'habit-card'} style={habitStyle(h)} onClick={() => tap(h)} aria-label={`${h.name}: ${v.spoken}`}>
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

/** What a card shows: today's mark, or the week's count for a weekly goal, or today's minutes. */
function cardValue(h: Habit, data: HabitData): { text: ReactNode; spoken: string; dim: boolean } {
  const today = habitDay(h, data.today, data);
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
