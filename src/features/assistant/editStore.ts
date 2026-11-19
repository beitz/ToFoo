/**
 * Reading and writing the saved entries behind the recent days list and the change and delete
 * cards (docs/SPEC.md, "Recent days and changing saved entries"). Every write returns its undo.
 */
import type { RecentRecord } from '../../logic/edits';
import type { EditTarget } from '../../ai/edits';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import type { FeatureKey, Habit, Profile } from '../../storage/types';
import { deleteWeighIn, saveWeighIn } from '../weight/weighIns';

type Features = Partial<Record<FeatureKey, boolean>>;

/**
 * Everything saved on these days that the recent days list may hold: the food log always, the
 * trackers only while they are on. Private journal entries never go (they are left out of
 * everything sent unless ticked for one chat under Include my data).
 */
export async function readRecentRecords(days: readonly string[], features: Features, profile: Pick<Profile, 'weightHistory'>): Promise<RecentRecord[]> {
  const on = (k: FeatureKey) => isOn(features, k);
  const db = repo.db;
  const keys = [...days];
  const [log, journal, sleep, activities, water, pressures, ketones, habitDays, habits] = await Promise.all([
    db.log.where('day').anyOf(keys).toArray(),
    on('journal') ? db.journal.where('day').anyOf(keys).toArray() : [],
    on('sleep') ? db.sleep.where('day').anyOf(keys).toArray() : [],
    on('activity') ? db.activities.where('day').anyOf(keys).toArray() : [],
    on('water') ? db.water.where('day').anyOf(keys).toArray() : [],
    on('bloodPressure') ? db.bloodPressure.where('day').anyOf(keys).toArray() : [],
    on('ketosis') && on('ketoneReadings') ? db.ketones.where('day').anyOf(keys).toArray() : [],
    on('habits') ? db.habitDays.where('day').anyOf(keys).toArray() : [],
    on('habits') ? db.habits.toArray() : ([] as Habit[]),
  ]);
  const habitById = new Map(habits.map((h) => [h.id, h]));
  const wanted = new Set(days);
  return [
    ...log.map((rec): RecentRecord => ({ kind: 'log', rec })),
    ...journal.filter((j) => !j.private).map((rec): RecentRecord => ({ kind: 'journal', rec })),
    ...sleep.map((rec): RecentRecord => ({ kind: 'sleep', rec })),
    ...activities.map((rec): RecentRecord => ({ kind: 'activity', rec })),
    ...water.map((rec): RecentRecord => ({ kind: 'water', rec })),
    ...(on('weight') ? profile.weightHistory.filter((w) => wanted.has(w.day)).map((rec): RecentRecord => ({ kind: 'weight', rec })) : []),
    ...pressures.map((rec): RecentRecord => ({ kind: 'bloodPressure', rec })),
    ...ketones.map((rec): RecentRecord => ({ kind: 'ketone', rec })),
    ...habitDays.flatMap((rec): RecentRecord[] => {
      const h = habitById.get(rec.habitId);
      return h && h.kind !== 'minutes' ? [{ kind: 'habit', rec, habit: { name: h.name, kind: h.kind } }] : [];
    }),
  ];
}

/** The entry a card points at, as it is saved now; undefined if it is gone. */
export async function readTarget(t: Pick<EditTarget, 'kind' | 'id'>): Promise<RecentRecord | undefined> {
  const db = repo.db;
  switch (t.kind) {
    case 'log': {
      const rec = await db.log.get(t.id);
      return rec && { kind: 'log', rec };
    }
    case 'journal': {
      const rec = await db.journal.get(t.id);
      return rec && { kind: 'journal', rec };
    }
    case 'sleep': {
      const rec = await db.sleep.get(t.id);
      return rec && { kind: 'sleep', rec };
    }
    case 'activity': {
      const rec = await db.activities.get(t.id);
      return rec && { kind: 'activity', rec };
    }
    case 'water': {
      const rec = await db.water.get(t.id);
      return rec && { kind: 'water', rec };
    }
    case 'weight': {
      const rec = (await repo.getProfile())?.weightHistory.find((w) => w.day === t.id);
      return rec && { kind: 'weight', rec };
    }
    case 'bloodPressure': {
      const rec = await db.bloodPressure.get(t.id);
      return rec && { kind: 'bloodPressure', rec };
    }
    case 'ketone': {
      const rec = await db.ketones.get(t.id);
      return rec && { kind: 'ketone', rec };
    }
    case 'habit': {
      const rec = await db.habitDays.get(t.id);
      const habit = rec && (await db.habits.get(rec.habitId));
      return rec && habit ? { kind: 'habit', rec, habit: { name: habit.name, kind: habit.kind } } : undefined;
    }
  }
}

/** Put an entry as given (same id): a change, or the undo of one. */
async function put(r: RecentRecord): Promise<void> {
  switch (r.kind) {
    case 'log':
      // Keeps a batch's portions left in step when a portion changes.
      return repo.updateLog(r.rec);
    case 'journal':
      return repo.updateJournal(r.rec);
    case 'sleep':
      return repo.restoreSleep(r.rec);
    case 'activity':
      return repo.updateActivity(r.rec);
    case 'water':
      return repo.updateWater(r.rec);
    case 'weight':
      await saveWeighIn(r.rec.day, r.rec.kg);
      return;
    case 'bloodPressure':
      return repo.updateBloodPressure(r.rec);
    case 'ketone':
      return repo.restoreKetone(r.rec);
    case 'habit':
      await repo.setHabitDay(r.rec.habitId, r.rec.day, r.rec.did);
      return;
  }
}

/** Save a changed entry over the one it was; the undo puts the old one back. */
export async function saveChanged(before: RecentRecord, after: RecentRecord): Promise<() => Promise<void>> {
  await put(after);
  return () => put(before);
}

/** Delete an entry; the undo puts it back as it was. */
export async function deleteRecord(r: RecentRecord): Promise<() => Promise<void>> {
  switch (r.kind) {
    case 'log': {
      const old = await repo.deleteLog(r.rec.id);
      return async () => void (old && (await repo.restoreLog(old)));
    }
    case 'journal': {
      const old = await repo.deleteJournal(r.rec.id);
      return async () => void (old && (await repo.restoreJournal(old)));
    }
    case 'sleep': {
      const old = await repo.deleteSleep(r.rec.id);
      return async () => void (old && (await repo.restoreSleep(old)));
    }
    case 'activity': {
      const old = await repo.deleteActivity(r.rec.id);
      return async () => void (old && (await repo.restoreActivity(old)));
    }
    case 'water': {
      const old = await repo.deleteWater(r.rec.id);
      return async () => void (old && (await repo.restoreWater(old)));
    }
    case 'weight':
      return deleteWeighIn(r.rec.day);
    case 'bloodPressure': {
      const old = await repo.deleteBloodPressure([r.rec.id]);
      return () => repo.restoreBloodPressure(old);
    }
    case 'ketone': {
      const old = await repo.deleteKetone(r.rec.id);
      return async () => void (old && (await repo.restoreKetone(old)));
    }
    case 'habit': {
      const old = await repo.setHabitDay(r.rec.habitId, r.rec.day, null);
      return () => repo.restoreHabitDay(r.rec.habitId, r.rec.day, old);
    }
  }
}
