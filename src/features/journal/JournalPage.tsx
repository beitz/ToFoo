import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { dayKey, formatDay, formatTime } from '../../lib/dates';
import { repo } from '../../storage/repo';
import type { JournalEntry } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { JournalEditor } from './JournalEditor';
import { JournalSheet } from './JournalSheet';
import { useJournal } from './useJournal';

/** Days shown at first; older ones one tap away, so the page stays quick with a long journal. */
const DAYS_SHOWN = 30;

/**
 * Route #/journal (pen button on Home, home-screen shortcut): write straight away, and read back
 * what was written, newest first.
 */
export function JournalPage() {
  const d = useData();
  const toast = useToast();
  const entries = useJournal();
  const [text, setText] = useState('');
  const [time, setTime] = useState(() => Date.now());
  // The time follows the clock until the user changes it.
  const [timeSet, setTimeSet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [allDays, setAllDays] = useState(false);

  async function save() {
    if (!text.trim() || busy) return;
    const at = timeSet ? time : Date.now();
    const added = await repo.addJournal({ time: at, day: dayKey(new Date(at)), text: text.trim() });
    toast(t('journal.saved'), () => void repo.deleteJournal(added.id));
    setText('');
    setTimeSet(false);
    setTime(Date.now());
  }

  const byDay = new Map<string, JournalEntry[]>();
  for (const e of [...(entries ?? [])].reverse()) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const days = [...byDay.keys()];
  const shown = allDays ? days : days.slice(0, DAYS_SHOWN);

  return (
    <section>
      <header className="page-head row">
        <a className="icon-btn" href={href()} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{t('journal.title')}</h1>
      </header>

      <div className="card">
        <JournalEditor
          text={text}
          onText={setText}
          time={timeSet ? time : Date.now()}
          onTime={(v) => {
            setTime(v);
            setTimeSet(true);
          }}
          autoFocus
          onBusy={setBusy}
        />
        <div className="sheet-actions">
          <button className="btn btn-primary" disabled={!text.trim() || busy} onClick={() => void save()}>
            {t('common.save')}
          </button>
        </div>
      </div>

      {entries && entries.length === 0 && <p className="muted small">{t('journal.empty')}</p>}
      {shown.map((day) => (
        <div key={day}>
          <h2 className="section-title">
            <a href={href('diary', day)}>{formatDay(day, d.today)}</a>
          </h2>
          <ul className="plain-list">
            {byDay.get(day)!.map((e) => (
              <li key={e.id}>
                <JournalRow entry={e} onEdit={() => setEditing(e)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!allDays && days.length > DAYS_SHOWN && (
        <button className="btn btn-secondary" onClick={() => setAllDays(true)}>
          {t('journal.showOlder', { n: days.length - DAYS_SHOWN })}
        </button>
      )}

      {editing && <JournalSheet entry={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** One entry: time and text; tap to edit. */
export function JournalRow({ entry, onEdit }: { entry: JournalEntry; onEdit: () => void }) {
  return (
    <button className="entry-row journal-row" onClick={onEdit}>
      <span className="journal-time muted small">{formatTime(entry.time)}</span>
      <span className="journal-text">{entry.text}</span>
      <span className="entry-edit">
        <Icon name="edit" size={16} />
      </span>
    </button>
  );
}
