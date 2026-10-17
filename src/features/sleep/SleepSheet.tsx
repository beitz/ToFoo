import { useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { duration, MAX_SLEEP_MS } from '../../logic/sleep';
import { repo } from '../../storage/repo';
import type { SleepRecord } from '../../storage/types';
import { Sheet } from '../../ui/controls';
import { TimeField } from '../log/TimeField';
import { durationText } from './format';

/** Save a sleep with both times, with undo. */
export async function saveSleepWithUndo(s: { start: number; end: number }, toast: ReturnType<typeof useToast>, replacing?: string): Promise<() => Promise<void>> {
  const { saved, replaced } = await repo.saveSleep(s, replacing);
  const undo = () => repo.undoSleep(saved, replaced);
  toast(t('sleep.saved', { duration: durationText(duration(s)) }), undo);
  return undo;
}

/** Problem with two sleep times, or undefined if they are fine. */
export function sleepProblem(s: { start: number; end: number }, now = Date.now()): string | undefined {
  if (s.end <= s.start) return t('sleep.problem.order');
  if (s.end - s.start > MAX_SLEEP_MS) return t('sleep.problem.long');
  if (s.end > now + 60_000) return t('sleep.problem.future');
  return undefined;
}

/** Add a sleep (from `initial`), or edit or delete one, with undo. */
export function SleepSheet({ record, initial, onClose }: { record?: SleepRecord; initial?: { start: number; end: number }; onClose: () => void }) {
  const toast = useToast();
  const [start, setStart] = useState(() => record?.start ?? initial?.start ?? Date.now() - 8 * 3_600_000);
  const [end, setEnd] = useState(() => record?.end ?? initial?.end ?? Date.now());
  const problem = sleepProblem({ start, end });

  async function save() {
    if (problem) return;
    await saveSleepWithUndo({ start, end }, toast, record?.id);
    onClose();
  }

  async function remove() {
    if (!record) return;
    const old = await repo.deleteSleep(record.id);
    if (old) toast(t('sleep.deleted'), () => repo.restoreSleep(old));
    onClose();
  }

  return (
    <Sheet title={t(record ? 'sleep.editTitle' : 'sleep.addTitle')} onClose={onClose}>
      <TimeField label={t('sleep.fellAsleep')} value={start} onChange={setStart} />
      <TimeField label={t('sleep.wokeUp')} value={end} onChange={setEnd} />
      <p className={problem ? 'notice small' : 'muted'} role={problem ? 'alert' : undefined}>
        {problem ?? durationText(duration({ start, end }))}
      </p>
      <div className="sheet-actions">
        {record && (
          <button className="btn btn-ghost" onClick={() => void remove()}>
            {t('common.delete')}
          </button>
        )}
        <button className="btn btn-primary" disabled={!!problem} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
