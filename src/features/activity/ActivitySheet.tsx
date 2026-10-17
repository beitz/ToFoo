import { useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { repo } from '../../storage/repo';
import type { ActivityRecord } from '../../storage/types';
import { Sheet } from '../../ui/controls';
import { ActivityForm, DEFAULT_ACTIVITY_SKIN, draftOf, recordOf, type ActivityDraft } from './ActivityForm';

/** Add an activity (starting at `defaultTime`), or edit or delete one, with undo. */
export function ActivitySheet({ activity, defaultTime, onClose }: { activity?: ActivityRecord; defaultTime: number; onClose: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<ActivityDraft>(() =>
    activity ? draftOf(activity) : { kind: 'walk', name: '', time: defaultTime, minutes: 30, intensity: 'moderate', outside: true, sun: true, skin: DEFAULT_ACTIVITY_SKIN },
  );
  const r = recordOf(draft);

  async function save() {
    if (!r.ok) return;
    const fields = { ...r.fields, day: dayKey(new Date(r.fields.time)) };
    if (activity) {
      // Optional fields left out of `fields` must not survive from the old record.
      const { name: _n, sunSkin: _s, ...kept } = activity;
      await repo.updateActivity({ ...kept, ...fields });
      toast(t('activity.updated'), () => repo.restoreActivity(activity));
    } else {
      const added = await repo.addActivity(fields);
      toast(t('activity.saved'), () => void repo.deleteActivity(added.id));
    }
    onClose();
  }

  async function remove() {
    if (!activity) return;
    const old = await repo.deleteActivity(activity.id);
    if (old) toast(t('activity.deleted'), () => repo.restoreActivity(old));
    onClose();
  }

  return (
    <Sheet title={t(activity ? 'activity.editTitle' : 'activity.addTitle')} onClose={onClose}>
      <ActivityForm draft={draft} onChange={setDraft} />
      {!r.ok && (
        <p className="notice small" role="alert">
          {r.problem}
        </p>
      )}
      <div className="sheet-actions">
        {activity && (
          <button className="btn btn-ghost" onClick={() => void remove()}>
            {t('common.delete')}
          </button>
        )}
        <button className="btn btn-primary" disabled={!r.ok} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
