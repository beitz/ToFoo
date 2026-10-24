import { dayKey } from '../../lib/dates';

/** One user-facing change: a merged pull request with its line(s) from src/i18n/changes.en.ts. */
export interface Change {
  pr: number;
  /** The version it went live in and when it was merged; missing before it is merged or without the git history. */
  version?: string;
  date?: string;
}

/** The changes of one day, newest first; `day` is null for the ones not released yet. */
export interface ChangeDay {
  day: string | null;
  /** Lowest and highest version of the day, for "0.1.144 – 0.1.146". */
  first?: string;
  last?: string;
  changes: Change[];
}

const LINE = /^change\.(\d+)$/;

/** Every change listed in the messages (`change.<pr>`), with its release from the build, newest first. */
export function changeList(keys: readonly string[], releases: Record<number, { version: string; date: string }>): Change[] {
  const changes: Change[] = [];
  for (const k of keys) {
    const m = LINE.exec(k);
    if (!m) continue;
    const pr = Number(m[1]);
    changes.push({ pr, ...releases[pr] });
  }
  // Merge order, not number order: a pull request opened early can be merged late. Not merged yet goes first.
  return changes.sort((a, b) => (b.date ?? '￿').localeCompare(a.date ?? '￿') || b.pr - a.pr);
}

/** The changes grouped by the local day they went live; `keep` picks which ones (e.g. only the highlights). */
export function byDay(changes: Change[], keep: (c: Change) => boolean = () => true): ChangeDay[] {
  const days: ChangeDay[] = [];
  for (const c of changes) {
    const day = c.date ? dayKey(new Date(c.date)) : null;
    let group = days[days.length - 1];
    if (!group || group.day !== day) days.push((group = { day, changes: [] }));
    // The version range covers the whole day, highlights or not, so it says which versions the day brought.
    if (c.version) {
      group.last ??= c.version;
      group.first = c.version;
    }
    if (keep(c)) group.changes.push(c);
  }
  return days.filter((d) => d.changes.length > 0);
}
