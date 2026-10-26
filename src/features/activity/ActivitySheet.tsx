import { useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { repo } from '../../storage/repo';
import type { ActivityRecord } from '../../storage/types';
import { Sheet } from '../../ui/controls';
import { ActivityPicks } from './ActivityPicks';
import { ActivityForm, DEFAULT_ACTIVITY_SKIN, draftOf, recordOf, type ActivityDraft } from './ActivityForm';

/**
 * Add an activity (starting at `defaultTime`), or edit or delete one, with undo. `initial` fills in a
 * new one (a habit's activity and minutes), and `presets` offers other activities as one-tap chips.
 * A plain new one starts with Favourites and Recent (ActivityPicks).
 */
export function ActivitySheet({
  activity,
  defaultTime,
  onClose,
  initial,
  presets,
}: {
  activity?: ActivityRecord;
  defaultTime: number;
  onClose: () => void;
  initial?: Partial<ActivityDraft>;
  presets?: Array<{ label: string; patch: Partial<ActivityDraft> }>;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<ActivityDraft>(() =>
    activity ? draftOf(activity) : { kind: 'walk', name: '', time: defaultTime, minutes: 30, intensity: 'moderate', outside: true, sun: true, skin: DEFAULT_ACTIVITY_SKIN, ...initial },
  );
  const r = recordOf(draft);

  async function save() {
    if (!r.ok) return;
    const fields = { ...r.fields, day: dayKey(new Date(r.fields.time)) };
    if (activity) {
      // Optional fields left out of `fields` must not survive from the old record.
      const { name: _n, sunSkin: _s, compendium: _c, ...kept } = activity;
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
      {presets && presets.length > 1 && (
        <div className="chips">
          {presets.map((p) => {
            const on = p.patch.kind === draft.kind && (p.patch.name ?? '') === draft.name;
            return (
              <button key={p.label} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => setDraft({ ...draft, ...p.patch })}>
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      {!activity && !initial && <ActivityPicks draft={draft} onPick={(patch) => setDraft({ ...draft, ...patch })} />}
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
