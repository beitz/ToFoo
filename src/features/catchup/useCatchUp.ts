import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { isOn } from '../../settings/features';
import { missingOn, type CatchUpKind } from '../../logic/catchUp';
import { repo } from '../../storage/repo';
import { useSleep } from '../sleep/useSleep';

/** "Skip" for meals keeps the key the old yesterday question used, so earlier answers still hold. */
export const foodSkipKey = (day: string) => `nudge:${day}`;
/** "Skip" for the trackers: the kinds skipped on that day. */
export const skipKey = (day: string) => `catchUp:${day}`;

/** Mark `kind` as skipped on `day`; returns an undo. */
export async function skip(day: string, kind: CatchUpKind): Promise<() => Promise<void>> {
  if (kind === 'food') {
    await repo.setMeta(foodSkipKey(day), true);
    return () => repo.setMeta(foodSkipKey(day), false);
  }
  const before = (await repo.getMeta<CatchUpKind[]>(skipKey(day))) ?? [];
  await repo.setMeta(skipKey(day), [...before.filter((k) => k !== kind), kind]);
  return () => repo.setMeta(skipKey(day), before);
}

/** What `day` is missing among meals and the trackers that are on, live; undefined while loading. */
export function useCatchUp(day: string): CatchUpKind[] | undefined {
  const d = useData();
  const sleep = useSleep();
  const water = useLiveQuery(() => repo.db.water.toArray(), []);
  const skipped = useLiveQuery(async () => {
    const kinds = new Set((await repo.getMeta<CatchUpKind[]>(skipKey(day))) ?? []);
    if (await repo.getMeta<boolean>(foodSkipKey(day))) kinds.add('food');
    return kinds;
  }, [day]);
  if (!sleep || !water || !skipped) return undefined;
  const f = d.settings.features;
  return missingOn({
    day,
    on: { sleep: isOn(f, 'sleep'), activity: isOn(f, 'activity'), water: isOn(f, 'water') },
    foodUnknown: d.model.dayStatus[day] === 'unknown',
    beforeStart: day < d.profile.modelStartDay,
    sleep,
    activities: d.activities,
    water,
    skipped,
  });
}
