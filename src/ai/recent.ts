/**
 * Recent days for the assistant (docs/SPEC.md, "Recent days and changing saved entries"): with the
 * user's tick, the first message of a chat carries a compact list of what is saved for today and
 * the days before (foods with grams and times, sleep and the other trackers that are on), each
 * entry with a short ref (e1, s1, …) that change and delete cards point at. Later messages carry
 * only what changed in those days since. So the assistant skips what is already logged, knows
 * "the usual", and can propose corrections. Pure: the records come in, text and refs go out.
 */
import { addDays } from '../lib/dates';
import { refKey } from '../lib/refs';
import { recordDay, recordId, recordTime, type RecentKind, type RecentRecord } from '../logic/edits';
import { fmtLocalDateTime } from './photoTime';

/** Most days before today the user can include (owner's ask, 2026-11-19: "the last 7 days maybe"). */
export const MAX_RECENT_DAYS = 7;
/** Days before today offered in Settings; 3 unless the user picks another. */
export const RECENT_DAY_CHOICES = [1, 2, 3, 5, 7] as const;
export const DEFAULT_RECENT_DAYS = 3;
/** A journal entry is quoted only this far: enough to recognise it, not the whole text. */
const JOURNAL_SNIPPET = 120;

const PREFIX: Record<RecentKind, string> = { log: 'e', journal: 'j', sleep: 's', activity: 'a', water: 'w', weight: 'g', bloodPressure: 'd', ketone: 'k', habit: 'h' };
const SECTION: Record<RecentKind, string> = { log: 'food', journal: 'journal', sleep: 'sleep', activity: 'activity', water: 'water', weight: 'weight', bloodPressure: 'blood pressure', ketone: 'ketones', habit: 'habits' };
const ORDER: RecentKind[] = ['log', 'sleep', 'activity', 'water', 'weight', 'bloodPressure', 'ketone', 'habit', 'journal'];

/** What a chat holds of the recent days: kept with the conversation, so refs mean the same in every message. */
export interface RecentState {
  /** Days before today it was asked for. */
  n: number;
  /** The days covered, oldest first. */
  days: string[];
  /** Ref (e1, s2, …) → the entry it stands for. */
  refs: Record<string, { kind: RecentKind; id: string }>;
  /** Ref → its line as last sent, to tell what changed. */
  lines: Record<string, string>;
  /** Last number given per ref letter (refs are never reused, also after a delete). */
  counters: Record<string, number>;
}

/** What the change and delete tools read: the refs, and the entries behind them as they are now. */
export interface RecentContext {
  state: RecentState;
  /** Entries by ref; a ref missing here was deleted since. */
  byRef: ReadonlyMap<string, RecentRecord>;
}

const hm = (t: number) => fmtLocalDateTime(t).slice(-5);
const weekday = (day: string) => fmtLocalDateTime(new Date(`${day}T12:00`).getTime()).slice(0, 3);
const n1 = (x: number) => String(Math.round(x * 10) / 10);

/** One entry as the assistant reads it, without its ref and day. */
export function recentLine(r: RecentRecord): string {
  switch (r.kind) {
    case 'log': {
      const e = r.rec;
      const at = hm(e.time);
      if (e.kind === 'food') {
        const source = e.ref.source === 'BLS' ? `BLS ${e.ref.code}` : e.ref.source === 'custom' ? 'own food' : refKey(e.ref);
        return `${at} ${e.label} ${n1(e.grams)} g${e.pieces ? ` (${e.pieces} pieces)` : ''}${e.preparation !== 'asListed' ? `, ${e.preparation}` : ''} [${source}]`;
      }
      if (e.kind === 'portion') return `${at} ${e.label}: ${e.grams ? `${n1(e.grams)} g` : `${n1(e.portions)} portion${e.portions === 1 ? '' : 's'}`} from the ${e.storage === 'fresh' ? 'pot' : e.storage} [batch]`;
      if (e.kind === 'custom') return `${at} ${e.label}: ${n1(e.servings)} serving${e.servings === 1 ? '' : 's'} [own food]`;
      if (e.kind === 'manual') return `${at} ${e.label} [${e.isSupplement ? 'supplement, ' : ''}typed-in values]`;
      return `${at} ${e.label}`;
    }
    case 'journal': {
      const text = r.rec.text.replace(/\s+/g, ' ').trim();
      return `${hm(r.rec.time)} "${text.length > JOURNAL_SNIPPET ? `${text.slice(0, JOURNAL_SNIPPET - 1)}…` : text}"`;
    }
    case 'sleep':
      return r.rec.end !== undefined ? `${fmtLocalDateTime(r.rec.start).slice(0, 3)} ${hm(r.rec.start)} – ${fmtLocalDateTime(r.rec.end).slice(0, 3)} ${hm(r.rec.end)}` : `${hm(r.rec.start)} – still asleep`;
    case 'activity': {
      const a = r.rec;
      return `${hm(a.time)} ${a.kind}${a.name ? ` "${a.name}"` : ''} ${a.minutes} min${a.intensity ? `, ${a.intensity}` : ''}${a.outside ? ', outside' : ''}`;
    }
    case 'water':
      return `${hm(r.rec.time)} ${r.rec.ml} ml`;
    case 'weight':
      return `${n1(r.rec.kg)} kg`;
    case 'bloodPressure':
      return `${hm(r.rec.time)} ${r.rec.systolic}/${r.rec.diastolic}${r.rec.pulse ? `, pulse ${r.rec.pulse}` : ''}`;
    case 'ketone':
      return `${hm(r.rec.time)} ${r.rec.type} ${n1(r.rec.value)} ${r.rec.type === 'breath' ? 'ppm' : 'mmol/L'}`;
    case 'habit': {
      const answer = r.habit.kind === 'avoid' ? (r.rec.did ? 'had some / did it' : 'none') : r.rec.did ? 'done' : 'not done';
      return `"${r.habit.name}": ${answer}`;
    }
  }
}

/** The days a chat covers: today and the n days before, and the day the chat was opened for. */
export function recentDays(today: string, n: number, chatDay?: string, before: readonly string[] = []): string[] {
  const days = new Set(before);
  for (let i = 0; i <= n; i++) days.add(addDays(today, -i));
  if (chatDay && chatDay <= today) days.add(chatDay);
  return [...days].sort();
}

const sortKey = (r: RecentRecord) => `${recordDay(r)} ${ORDER.indexOf(r.kind)} ${String(recordTime(r) ?? 0).padStart(15, '0')} ${recordId(r)}`;
const dayTitle = (day: string, today: string) => `${weekday(day)} ${day}${day === today ? ' (today)' : ''}`;

/**
 * The note on a message: on the first one, the whole list; later only what is new, changed or
 * deleted since the last (undefined when nothing is). Returns the chat's new state and the
 * entries by ref for the change and delete tools.
 */
export function recentUpdate(
  records: readonly RecentRecord[],
  prev: RecentState | undefined,
  o: { n: number; days: readonly string[]; today: string },
): { note?: string; state: RecentState; context: RecentContext } {
  const sorted = [...records].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const refOf = new Map(Object.entries(prev?.refs ?? {}).map(([ref, x]) => [`${x.kind}:${x.id}`, ref]));
  const counters = { ...(prev?.counters ?? {}) };
  const refs: RecentState['refs'] = {};
  const lines: RecentState['lines'] = {};
  const byRef = new Map<string, RecentRecord>();
  const added: string[] = [];
  const changed: string[] = [];
  for (const r of sorted) {
    const id = recordId(r);
    let ref = refOf.get(`${r.kind}:${id}`);
    if (!ref) {
      const p = PREFIX[r.kind];
      counters[p] = (counters[p] ?? 0) + 1;
      ref = `${p}${counters[p]}`;
      added.push(ref);
    } else if (prev?.lines[ref] !== recentLine(r)) changed.push(ref);
    refs[ref] = { kind: r.kind, id };
    lines[ref] = recentLine(r);
    byRef.set(ref, r);
  }
  const gone = Object.keys(prev?.refs ?? {}).filter((ref) => !refs[ref]);
  const state: RecentState = { n: o.n, days: [...o.days], refs, lines, counters };
  const context = { state, byRef };
  const dayOfRef = (ref: string) => recordDay(byRef.get(ref)!);

  if (!prev) {
    const parts = o.days.map((day) => {
      const own = [...byRef].filter(([, r]) => recordDay(r) === day);
      if (!own.length) return `${dayTitle(day, o.today)}: nothing logged${day === o.today ? ' yet' : ''}.`;
      const sections = ORDER.flatMap((k) => {
        const of = own.filter(([, r]) => r.kind === k);
        return of.length ? [`  ${SECTION[k]}: ${of.map(([ref]) => `${ref} ${lines[ref]}`).join('; ')}`] : [];
      });
      return `${dayTitle(day, o.today)}:\n${sections.join('\n')}`;
    });
    return {
      state,
      context,
      note: `Recent days from the user's diary (today and the ${o.n} day${o.n === 1 ? '' : 's'} before), which the user chose to send with this chat. Each entry has a ref for change and delete cards; local times; a day with nothing listed may still have unlogged meals.\n${parts.join('\n')}\n`,
    };
  }

  const delta = [
    added.length && `new: ${added.map((ref) => `${ref} ${dayTitle(dayOfRef(ref), o.today)} ${lines[ref]}`).join('; ')}`,
    changed.length && `changed: ${changed.map((ref) => `${ref} now ${dayTitle(dayOfRef(ref), o.today)} ${lines[ref]}`).join('; ')}`,
    gone.length && `deleted: ${gone.join(', ')}`,
  ].filter(Boolean);
  return { state, context, ...(delta.length ? { note: `Diary changes in the recent days since the last list (refs stay the same): ${delta.join('. ')}.` } : {}) };
}
