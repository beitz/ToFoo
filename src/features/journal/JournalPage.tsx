import { useMemo, useState, type ReactNode } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { dayKey, formatDay, formatTime } from '../../lib/dates';
import { formatMonth } from '../../lib/periods';
import { journalSections, type JournalMonth } from '../../logic/journalSections';
import { AskLink } from '../../ui/AskChips';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import type { JournalEntry } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { JournalEditor } from './JournalEditor';
import { JournalSheet } from './JournalSheet';
import { useJournal } from './useJournal';
import { BackButton } from '../../ui/BackButton';

/**
 * Route #/journal (Insights): what was written, newest first, in month folds (earlier years one fold
 * each), and + to write. #/journal/new (pen button, home-screen shortcut) opens with the writing box
 * on top, so writing still takes no extra tap (owner's ask, 2026-10-23: Insights shows just the journal).
 */
export function JournalPage({ write = false }: { write?: boolean }) {
  const d = useData();
  const toast = useToast();
  const entries = useJournal();
  const [text, setText] = useState('');
  const [time, setTime] = useState(() => Date.now());
  // The time follows the clock until the user changes it.
  const [timeSet, setTimeSet] = useState(false);
  const [isPrivate, setPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | 'new' | null>(null);

  async function save() {
    if (!text.trim() || busy) return;
    const at = timeSet ? time : Date.now();
    const added = await repo.addJournal({ time: at, day: dayKey(new Date(at)), text: text.trim(), ...(isPrivate ? { private: true } : {}) });
    toast(t('journal.saved'), () => void repo.deleteJournal(added.id));
    setText('');
    setPrivate(false);
    setTimeSet(false);
    setTime(Date.now());
  }

  const sections = useMemo(() => journalSections(entries ?? [], d.today), [entries, d.today]);
  // The newest month opens; the rest stay folded until tapped.
  const newest = sections.months[0]?.month ?? sections.years[0]?.months[0]?.month;
  const month = (m: JournalMonth<JournalEntry>) => (
    <MonthFold key={m.month} month={m} open={m.month === newest}>
      {m.days.map(({ day, entries: list }) => (
        <div key={day} className="journal-day">
          <h3 className="journal-day-title small">
            <a href={href('diary', day)}>{formatDay(day, d.today)}</a>
          </h3>
          <ul className="plain-list">
            {list.map((e) => (
              <li key={e.id}>
                <JournalRow entry={e} onEdit={() => setEditing(e)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </MonthFold>
  );

  return (
    <section>
      <header className="page-head row">
        <BackButton to={['overview']} />
        <h1 className="grow">{t('journal.title')}</h1>
        {!write && (
          <button type="button" className="icon-btn" onClick={() => setEditing('new')} aria-label={t('journal.write')} title={t('journal.write')}>
            <Icon name="plus" />
          </button>
        )}
      </header>

      {write && (
        <div className="card">
          <JournalEditor
            text={text}
            onText={setText}
            time={timeSet ? time : Date.now()}
            onTime={(v) => {
              setTime(v);
              setTimeSet(true);
            }}
            isPrivate={isPrivate}
            onPrivate={setPrivate}
            autoFocus
            onBusy={setBusy}
          />
          <div className="sheet-actions">
            <button className="btn btn-primary" disabled={!text.trim() || busy} onClick={() => void save()}>
              {t('common.save')}
            </button>
          </div>
        </div>
      )}

      {isOn(d.settings.features, 'aiAssistant') && isOn(d.settings.features, 'insights') && (entries?.length ?? 0) > 0 && (
        <AskLink to={href('insights')} icon="insights" title={t('insights.open')} />
      )}
      {entries && entries.length === 0 && <p className="muted small">{t('journal.empty')}</p>}
      {sections.months.map(month)}
      {sections.years.map((y) => (
        <YearFold key={y.year} year={y.year} count={y.count}>
          {y.months.map(month)}
        </YearFold>
      ))}

      {editing && <JournalSheet entry={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** A month as a fold: its name and how many entries; the days are only drawn once it is open. */
function MonthFold({ month, open: initial, children }: { month: JournalMonth<JournalEntry>; open: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <details className="card fold journal-month" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="grow journal-fold-title">{formatMonth(month.month)}</span>
        <span className="muted small">{t(month.count === 1 ? 'journal.countOne' : 'journal.count', { n: month.count })}</span>
        <Icon name="down" size={18} />
      </summary>
      {open && children}
    </details>
  );
}

/** An earlier year: one line until opened, then its months. */
function YearFold({ year, count, children }: { year: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="fold journal-year" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="grow journal-fold-title">{year}</span>
        <span className="muted small">{t(count === 1 ? 'journal.countOne' : 'journal.count', { n: count })}</span>
        <Icon name="down" size={18} />
      </summary>
      {open && children}
    </details>
  );
}

/** One entry: time and text, a lock when private; tap to edit. */
export function JournalRow({ entry, onEdit }: { entry: JournalEntry; onEdit: () => void }) {
  return (
    <button className="entry-row journal-row" onClick={onEdit}>
      <span className="journal-time muted small">
        {formatTime(entry.time)}
        {entry.private && (
          <span className="journal-private" title={t('journal.private')}>
            <Icon name="lock" size={14} />
            <span className="visually-hidden">{t('journal.private')}</span>
          </span>
        )}
      </span>
      <span className="journal-text">{entry.text}</span>
      <span className="entry-edit">
        <Icon name="edit" size={16} />
      </span>
    </button>
  );
}
