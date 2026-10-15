import { useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import type { Storage } from '../../model/paramTypes';
import { repo } from '../../storage/repo';
import type { LogEntry } from '../../storage/types';
import { Field, NumberInput, Segmented, Sheet } from '../../ui/controls';
import { ConfidenceField } from '../log/ConfidenceField';
import { PreparationSelect } from '../log/PreparationSelect';
import { TimeField } from '../log/TimeField';

export function EditEntrySheet({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<LogEntry>(entry);
  const set = (patch: Partial<LogEntry>) => setDraft((d) => ({ ...d, ...patch }) as LogEntry);

  async function save() {
    await repo.updateLog({ ...draft, day: dayKey(new Date(draft.time)) });
    toast(t('diary.saved'), () => void repo.updateLog(entry));
    onClose();
  }
  async function remove() {
    const old = await repo.deleteLog(entry.id);
    onClose();
    if (old) toast(t('diary.deleted', { name: old.label }), () => void repo.restoreLog(old));
  }

  return (
    <Sheet title={entry.label} onClose={onClose}>
      {draft.kind === 'food' && (
        <>
          <Field label={t('log.amount')}>{(id) => <NumberInput id={id} value={draft.grams} onChange={(v) => v && set({ grams: v })} suffix="g" min={0} />}</Field>
          <PreparationSelect value={draft.preparation} onChange={(p) => set({ preparation: p })} />
        </>
      )}
      {draft.kind === 'portion' && (
        <>
          <Field label={t('diary.portions')}>{(id) => <NumberInput id={id} value={draft.portions} onChange={(v) => v && set({ portions: v })} min={0} />}</Field>
          <div className="field">
            <span className="field-label">{t('diary.storage')}</span>
            <Segmented<Storage>
              label={t('diary.storage')}
              value={draft.storage}
              onChange={(s) => set({ storage: s })}
              options={[
                { value: 'fresh', label: t('storage.fresh') },
                { value: 'fridge', label: t('storage.fridge') },
                { value: 'freezer', label: t('storage.freezer') },
              ]}
            />
          </div>
        </>
      )}
      {draft.kind === 'custom' && (
        <Field label={t('diary.servings')}>{(id) => <NumberInput id={id} value={draft.servings} onChange={(v) => v && set({ servings: v })} min={0} />}</Field>
      )}
      {draft.kind === 'manual' && <p className="muted small">{t('diary.manualHint')}</p>}
      {draft.kind !== 'drink' && <ConfidenceField value={draft.confidence} onChange={(c) => set({ confidence: c })} />}
      <TimeField value={draft.time} onChange={(time) => set({ time })} />
      <div className="sheet-actions">
        <button className="btn btn-danger-ghost" onClick={() => void remove()}>
          {t('common.delete')}
        </button>
        <button className="btn btn-primary" onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
