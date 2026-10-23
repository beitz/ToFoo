import { repo } from '../../storage/repo';

const history = async () => (await repo.getProfile())?.weightHistory ?? [];

/** Set or clear one day's weigh-in in the profile (one per day: the newest wins). */
async function setDay(day: string, kg: number | undefined): Promise<void> {
  const h = await history();
  await repo.updateProfile({ weightHistory: [...h.filter((w) => w.day !== day), ...(kg ? [{ day, kg }] : [])] });
}

/** Save a weigh-in; the undo puts back what that day had before (or nothing). */
export async function saveWeighIn(day: string, kg: number): Promise<() => Promise<void>> {
  const before = (await history()).find((w) => w.day === day)?.kg;
  await setDay(day, kg);
  return () => setDay(day, before);
}

/** Delete a day's weigh-in; the undo brings it back. */
export async function deleteWeighIn(day: string): Promise<() => Promise<void>> {
  const before = (await history()).find((w) => w.day === day)?.kg;
  await setDay(day, undefined);
  return () => setDay(day, before);
}
