import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { repo } from '../../storage/repo';
import { Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { answerLabels, habitStyle } from '../habits/HabitParts';
import { ChangeButton, DoneRow } from './CardFrame';
import { useRegister, type Card, type CardProps, type Undo } from './cards';

/**
 * Answers to the user's habits from what they told the assistant (T1, …; docs/SPEC.md, "Habits"):
 * one row per habit and day with its two answers, each row can be left out, then saved together.
 */
export function HabitsProposalCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'habits' }>>) {
  const { habits: shown } = card;
  const d = useData();
  const all = useLiveQuery(() => repo.db.habits.toArray(), []);
  const was = useLiveQuery(() => repo.db.habitDays.bulkGet(shown.answers.map((a) => `${a.habitId}|${a.day}`)), [shown]);
  const [rows, setRows] = useState(() => shown.answers.map((a) => ({ ...a, keep: true })));
  const [saving, setSaving] = useState(false);
  const byId = new Map((all ?? []).map((h) => [h.id, h]));
  // A habit deleted since the card was shown can't be answered.
  const saved = rows.filter((r) => r.keep && byId.has(r.habitId));

  async function save(): Promise<Undo | undefined> {
    if (!saved.length || saving) return;
    setSaving(true);
    try {
      const olds: Array<{ r: (typeof saved)[number]; old: Awaited<ReturnType<typeof repo.setHabitDay>> }> = [];
      for (const r of saved) olds.push({ r, old: await repo.setHabitDay(r.habitId, r.day, r.did) });
      onLogged(true, { answers: saved.map(({ habitId, name, day, did }) => ({ habitId, name, day, did })) });
      return async () => {
        for (const { r, old } of olds.reverse()) await repo.restoreHabitDay(r.habitId, r.day, old);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(shown.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t('ai.habitsSaved'), undo);
  }

  if (card.logged) {
    const savedText = saved
      .map((r) => {
        const labels = answerLabels(byId.get(r.habitId) ?? { kind: 'do' });
        return `${r.name} ${formatDay(r.day, d.today)}: ${r.did ? labels.yes : labels.no}`;
      })
      .join(', ');
    return (
      <DoneRow>
        <span>
          {t('ai.habitsSavedList', { list: savedText })} <a href={href('habits')}>{t('ai.habitsOpen')}</a>
        </span>
      </DoneRow>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="repeat" size={18} /> {t('habits.title')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {shown.id}
        </span>
      </div>
      <ul className="habit-answers-list">
        {rows.map((r, i) => {
          const h = byId.get(r.habitId);
          const labels = answerLabels(h ?? { kind: 'do' });
          const before = was?.[i];
          const set = (patch: Partial<typeof r>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <li key={`${r.habitId}|${r.day}`} className={r.keep && h ? 'habit-answer' : 'habit-answer dim'} style={h ? habitStyle(h) : undefined}>
              <span className="habit-answer-head">
                <strong className="habit-name">{h?.name ?? r.name}</strong>
                <span className="muted small">{formatDay(r.day, d.today)}</span>
                <button type="button" className="icon-btn" onClick={() => set({ keep: !r.keep })} aria-label={t(r.keep ? 'ai.habitLeaveOut' : 'ai.habitPutBack', { name: r.name })} disabled={!h}>
                  <Icon name={r.keep ? 'close' : 'undo'} size={18} />
                </button>
              </span>
              {!h ? (
                <span className="muted small">{t('habits.gone')}</span>
              ) : r.keep ? (
                <>
                  <Segmented
                    label={`${r.name}, ${formatDay(r.day, d.today)}`}
                    value={r.did ? 'yes' : 'no'}
                    options={[
                      { value: 'yes', label: labels.yes },
                      { value: 'no', label: labels.no },
                    ]}
                    onChange={(v) => set({ did: v === 'yes' })}
                  />
                  {before && before.did !== r.did && <span className="muted small">{t('ai.habitWas', { answer: before.did ? labels.yes : labels.no })}</span>}
                </>
              ) : (
                <span className="muted small">{t('ai.habitLeftOut')}</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="sheet-actions">
        <ChangeButton />
        <button className="btn btn-primary" disabled={!saved.length || saving} onClick={() => void saveOne()}>
          {t('ai.habitsSave')}
        </button>
      </div>
    </div>
  );
}
