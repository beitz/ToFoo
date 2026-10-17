import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays, formatDay, formatTime } from '../../lib/dates';
import { fmtAmount } from '../../lib/format';
import { groupMeals } from '../../model/simulate';
import { repo } from '../../storage/repo';
import type { JournalEntry, LogEntry, SunEntry } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/controls';
import { entryAmount } from '../log/describe';
import { EditEntrySheet } from './EditEntrySheet';
import { SunEntrySheet } from './SunEntrySheet';
import { sunSessionsFor } from '../../logic/resolve';
import { logMealAgain } from '../log/logAgain';
import { isOn } from '../../settings/features';
import { JournalRow } from '../journal/JournalPage';
import { JournalSheet } from '../journal/JournalSheet';
import { useJournal } from '../journal/useJournal';
import { defaultTimeFor } from '../log/time';

type StatusChoice = 'auto' | 'logged' | 'partial' | 'fasted' | 'filled' | 'excluded';

export function DiaryPage({ day: dayParam }: { day?: string }) {
  const d = useData();
  const toast = useToast();
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam <= d.today ? dayParam : d.today;
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [addingSun, setAddingSun] = useState(false);
  // A journal entry being edited, or 'new' for one being written.
  const [journalSheet, setJournalSheet] = useState<JournalEntry | 'new' | null>(null);
  const journalOn = isOn(d.settings.features, 'journal');
  const notes = useJournal(day) ?? [];

  const entries = d.log.filter((e) => e.day === day);
  const meals = groupMeals(entries, d.settings.mealWindowMinutes);
  // Meals and journal entries in one timeline, so "tired after lunch" sits after the lunch;
  // journal entries with no meal between them share a card.
  type Item = { kind: 'meal'; time: number; meal: LogEntry[] } | { kind: 'notes'; time: number; notes: JournalEntry[] };
  const timeline: Item[] = [];
  const sorted = [...meals.map((meal) => ({ time: meal[0]!.time, meal })), ...notes.map((note) => ({ time: note.time, note }))].sort((a, b) => a.time - b.time);
  for (const x of sorted) {
    const last = timeline[timeline.length - 1];
    if ('meal' in x) timeline.push({ kind: 'meal', time: x.time, meal: x.meal });
    else if (last?.kind === 'notes') last.notes.push(x.note);
    else timeline.push({ kind: 'notes', time: x.time, notes: [x.note] });
  }
  const explicit = d.dayStatus.find((s) => s.day === day)?.status;
  const choice: StatusChoice = explicit ?? 'auto';
  const effective = d.model.dayStatus[day] ?? 'unknown';
  const mealSummary = d.model.meals.filter((m) => m.day === day);
  const totals = mealSummary.reduce<Record<string, number>>((acc, m) => {
    for (const [k, v] of Object.entries(m.intake)) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});
  const sunToday = d.sunEntries.filter((s) => s.day === day);
  const routine = sunSessionsFor(day, { ...d.profile }, []);

  async function setStatus(s: StatusChoice) {
    const prev = explicit ?? null;
    await repo.setDayStatus(day, s === 'auto' ? null : s);
    toast(t('diary.statusSaved'), () => void repo.setDayStatus(day, prev));
  }

  async function removeSun(s: SunEntry) {
    await repo.deleteSunEntry(s.id);
    toast(t('diary.sunRemoved'), () => void repo.db.sunEntries.put(s));
  }

  return (
    <section>
      <header className="page-head row-between">
        <button className="icon-btn" onClick={() => navigate('diary', addDays(day, -1))} aria-label={t('diary.prev')}>
          <Icon name="back" />
        </button>
        <h1>{formatDay(day, d.today)}</h1>
        <button className="icon-btn" disabled={day >= d.today} onClick={() => navigate('diary', addDays(day, 1))} aria-label={t('diary.next')}>
          <Icon name="chevron" />
        </button>
      </header>

      <div className="row diary-links">
        <a className="btn btn-small btn-secondary" href={href('calendar', day.slice(0, 7))}>
          <Icon name="calendar" size={18} /> {t('diary.calendar')}
        </a>
        <a className="btn btn-small btn-secondary" href={href('review', day, day)}>
          <Icon name="bars" size={18} /> {t('diary.dayNutrients')}
        </a>
      </div>

      <div className="card">
        <div className="row-between">
          <span className="muted small">{t('diary.status')}</span>
          <strong>{t(`day.${effective}` as MessageKey)}</strong>
        </div>
        <Segmented<StatusChoice>
          label={t('diary.status')}
          className="segmented-grid"
          value={choice}
          onChange={(v) => void setStatus(v)}
          options={[
            { value: 'auto', label: t('diary.auto') },
            { value: 'logged', label: t('diary.complete') },
            { value: 'partial', label: t('diary.partial') },
            { value: 'fasted', label: t('diary.fasted') },
            { value: 'filled', label: t('diary.filled') },
            { value: 'excluded', label: t('diary.excluded') },
          ]}
        />
        <p className="muted small">{t(choice === 'auto' && isOn(d.settings.features, 'fillUnloggedDays') ? 'diary.hint.autoFilled' : (`diary.hint.${choice}` as MessageKey))}</p>
      </div>

      <div className={journalOn ? 'diary-actions' : undefined}>
        <a className="btn btn-primary btn-block" href={href('log', day)}>
          <Icon name="plus" /> {t('diary.logForDay')}
        </a>
        {journalOn && (
          <button className="btn btn-secondary btn-block" onClick={() => setJournalSheet('new')}>
            <Icon name="plus" /> {t('journal.entryShort')}
          </button>
        )}
      </div>

      {timeline.length === 0 && <p className="muted empty">{t('diary.empty')}</p>}
      {timeline.map((item) =>
        item.kind === 'notes' ? (
          <div className="card journal-card" key={item.notes[0]!.id}>
            <span className="muted small journal-label">
              <Icon name="journal" size={16} /> {t('journal.entry')}
            </span>
            <ul className="plain-list">
              {item.notes.map((note) => (
                <li key={note.id}>
                  <JournalRow entry={note} onEdit={() => setJournalSheet(note)} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <MealCard key={item.meal[0]!.id} meal={item.meal} day={day} onEdit={setEditing} />
        ),
      )}

      {meals.length > 0 && <p className="muted small">{t('diary.editHint')}</p>}
      {mealSummary.length > 0 && (
        <p className="muted small">
          {t('diary.totals')}: {fmtAmount('ENERCC', totals.ENERCC ?? 0)} · {t('nutrient.protein')} {fmtAmount('PROT625', totals.PROT625 ?? 0)} · {t('nutrient.fat')} {fmtAmount('FAT', totals.FAT ?? 0)}
        </p>
      )}

      <h2 className="section-title">
        <Icon name="sun" /> {t('diary.outside')}
      </h2>
      <p className="muted small">
        {routine.length ? t('diary.routine', { min: routine.reduce((a, s) => a + s.minutes, 0) }) : t('diary.noRoutine')}{' '}
        <a href={href('settings', 'sun')}>{t('diary.editRoutine')}</a>
      </p>
      <ul className="plain-list">
        {sunToday.map((s) => (
          <li key={s.id} className="row-between">
            <span>
              {t('diary.sunEntry', { min: s.minutes, time: `${String(Math.floor(s.startHour)).padStart(2, '0')}:${String(Math.round((s.startHour % 1) * 60)).padStart(2, '0')}` })} · {t(`skin.${s.skin}` as MessageKey)}
            </span>
            <button className="icon-btn" onClick={() => void removeSun(s)} aria-label={t('common.delete')}>
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <button className="btn btn-secondary" onClick={() => setAddingSun(true)}>
        <Icon name="plus" /> {t('diary.addOutside')}
      </button>

      {editing && <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />}
      {addingSun && <SunEntrySheet day={day} onClose={() => setAddingSun(false)} />}
      {journalSheet && (
        <JournalSheet entry={journalSheet === 'new' ? undefined : journalSheet} defaultTime={defaultTimeFor(day, d.today)} onClose={() => setJournalSheet(null)} />
      )}
    </section>
  );
}

/** One meal: its items, each tappable to edit, and "Log again". */
function MealCard({ meal, day, onEdit }: { meal: LogEntry[]; day: string; onEdit: (e: LogEntry) => void }) {
  const d = useData();
  const toast = useToast();
  return (
    <div className="card meal">
      <div className="meal-head">
        <strong>{formatTime(meal[0]!.time)}</strong>
        <span className="muted small">{t('diary.meal')}</span>
        <button
          className="btn btn-small btn-ghost meal-again"
          aria-label={t('repeat.againLabel')}
          onClick={async () => {
            // The copy is logged now; show today's diary so it can be edited straight away.
            const added = await logMealAgain(meal, Date.now(), d.batchesById, toast);
            if (added.length && day !== d.today) navigate('diary');
          }}
        >
          <Icon name="repeat" size={16} /> {t('repeat.again')}
        </button>
      </div>
      <ul className="plain-list">
        {meal.map((e) => (
          <li key={e.id}>
            <button className="entry-row" onClick={() => onEdit(e)}>
              <span className="entry-label">{e.label}</span>
              <span className="muted small">{entryAmount(e, d)}</span>
              <span className={`conf conf-${e.confidence}`} title={t(`confidence.${e.confidence}` as MessageKey)}>
                {e.confidence}
              </span>
              <span className="entry-edit">
                <Icon name="edit" size={16} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
