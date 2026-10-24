import { useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { repo } from '../../storage/repo';
import type { JournalEntry } from '../../storage/types';
import { Sheet } from '../../ui/controls';
import { JournalEditor } from './JournalEditor';

/** Write a new journal entry (at `defaultTime`), or edit or delete one, with undo. */
export function JournalSheet({ entry, defaultTime, onClose }: { entry?: JournalEntry; defaultTime?: number; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(entry?.text ?? '');
  const [time, setTime] = useState(() => entry?.time ?? defaultTime ?? Date.now());
  const [isPrivate, setPrivate] = useState(!!entry?.private);
  const [busy, setBusy] = useState(false);
  const canSave = !!text.trim() && !busy;

  async function save() {
    if (!canSave) return;
    const fields = { time, day: dayKey(new Date(time)), text: text.trim(), ...(isPrivate ? { private: true } : {}) };
    if (entry) {
      // Unticking drops the mark rather than storing private: false.
      const { private: _, ...rest } = entry;
      await repo.updateJournal({ ...rest, ...fields });
      toast(t('journal.updated'), () => repo.restoreJournal(entry));
    } else {
      const added = await repo.addJournal(fields);
      toast(t('journal.saved'), () => void repo.deleteJournal(added.id));
    }
    onClose();
  }

  async function remove() {
    if (!entry) return;
    const old = await repo.deleteJournal(entry.id);
    if (old) toast(t('journal.deleted'), () => repo.restoreJournal(old));
    onClose();
  }

  return (
    <Sheet title={t(entry ? 'journal.editTitle' : 'journal.write')} onClose={onClose}>
      <JournalEditor text={text} onText={setText} time={time} onTime={setTime} isPrivate={isPrivate} onPrivate={setPrivate} autoFocus={!entry} onBusy={setBusy} />
      <div className="sheet-actions">
        {entry && (
          <button className="btn btn-ghost" onClick={() => void remove()}>
            {t('common.delete')}
          </button>
        )}
        <button className="btn btn-primary" disabled={!canSave} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
