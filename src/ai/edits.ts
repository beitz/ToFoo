/**
 * Change (C) and delete (X) cards for entries already saved (docs/SPEC.md, "Recent days and
 * changing saved entries"). The assistant points at entries by the refs of the recent days list;
 * the app checks every change against the entry as it is now and sends problems back to fix.
 * Nothing changes until the user taps the card. Pure.
 */
import { z } from 'zod';
import { applyEdit, editableFields, recordDay, recordId, sameRecord, type EditPatch, type RecentKind, type RecentRecord } from '../logic/edits';
import { MAX_SLEEP_MS, overlaps } from '../logic/sleep';
import { MAX_ACTIVITY_MINUTES } from '../logic/activity';
import { MAX_WATER_ML } from '../logic/water';
import { BP_INPUT, bpProblem } from '../logic/bloodPressure';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG } from '../logic/weight';
import { INTENSITIES } from '../storage/types';
import type { RecentContext } from './recent';
import { checkTime, MAX_ITEM_GRAMS, MAX_JOURNAL_CHARS, MAX_KETONE, MAX_PIECES, MAX_SERVING_PORTIONS } from './tools';

/** At most this many entries on one card: one meal, a morning, not a whole week. */
const MAX_EDITS = 20;
const MAX_REASON_CHARS = 300;

const blank = (s: string | undefined) => (s?.trim() ? s.trim() : undefined);

export const changeProposalInput = z.object({
  edits: z.array(
    z
      .object({
        ref: z.string(),
        time: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        grams: z.number().optional(),
        pieces: z.number().optional(),
        portions: z.number().optional(),
        servings: z.number().optional(),
        minutes: z.number().optional(),
        intensity: z.union([z.literal(''), z.enum(INTENSITIES)]).optional(),
        ml: z.number().optional(),
        kg: z.number().optional(),
        systolic: z.number().optional(),
        diastolic: z.number().optional(),
        pulse: z.number().optional(),
        value: z.number().optional(),
        text: z.string().optional(),
        did: z.boolean().optional(),
      })
      .strict(),
  ),
  reason: z.string().optional(),
  replaces: z.string().optional(),
});

export const deleteProposalInput = z.object({
  refs: z.array(z.string()),
  reason: z.string().optional(),
  replaces: z.string().optional(),
});

/** An entry a card points at: its ref in the chat, where it is saved, and a name and day for the card. */
export interface EditTarget {
  ref: string;
  kind: RecentKind;
  id: string;
  /** A logged food's or dish's name, a habit's name, the start of a journal entry; empty for the rest. */
  name: string;
  day: string;
}

/** Changes to saved entries the assistant proposes (C1, …), each applied to the entry as it is when the user taps. */
export interface ChangeProposal {
  edits: Array<EditTarget & { patch: EditPatch }>;
  /** One line why, in the user's terms ("you said 2 eggs, not 3"). */
  reason?: string;
  replaces?: string;
}

/** Saved entries the assistant proposes to delete (X1, …). */
export interface DeleteProposal {
  targets: EditTarget[];
  reason?: string;
  replaces?: string;
}

function targetOf(ref: string, r: RecentRecord): EditTarget {
  const name = r.kind === 'log' ? r.rec.label : r.kind === 'habit' ? r.habit.name : r.kind === 'journal' ? r.rec.text.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  return { ref, kind: r.kind, id: recordId(r), name, day: recordDay(r) };
}

const issues = (e: z.ZodError) => `Invalid input: ${e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;

/** A ref the card may use: in the recent days list and still saved. */
function lookup(ref: string, recent: RecentContext): { record?: RecentRecord; problem?: string } {
  const r = recent.byRef.get(ref.trim());
  if (r) return { record: r };
  if (recent.state.refs[ref.trim()]) return { problem: `${ref} was deleted from the diary since the list; nothing to do for it.` };
  return { problem: `"${ref}" is not a ref from the recent days list; use a ref exactly as listed (e1, s2, …).` };
}

/** What is wrong with an entry as the change would leave it, in the assistant's terms. */
function resultProblems(ref: string, next: RecentRecord, recent: RecentContext): string[] {
  const out: string[] = [];
  switch (next.kind) {
    case 'log': {
      const e = next.rec;
      if ((e.kind === 'food' || (e.kind === 'portion' && e.grams)) && (e.grams === undefined || !(e.grams > 0) || e.grams > MAX_ITEM_GRAMS)) out.push(`${ref}: grams must be more than 0 and at most ${MAX_ITEM_GRAMS}.`);
      if (e.kind === 'food' && e.pieces !== undefined && (!(e.pieces > 0) || e.pieces > MAX_PIECES)) out.push(`${ref}: pieces must be more than 0 and at most ${MAX_PIECES}.`);
      if (e.kind === 'portion' && !e.grams && (!(e.portions > 0) || e.portions > MAX_SERVING_PORTIONS)) out.push(`${ref}: portions must be more than 0 and at most ${MAX_SERVING_PORTIONS}.`);
      if (e.kind === 'custom' && (!(e.servings > 0) || e.servings > MAX_SERVING_PORTIONS)) out.push(`${ref}: servings must be more than 0 and at most ${MAX_SERVING_PORTIONS}.`);
      break;
    }
    case 'journal':
      if (!next.rec.text.trim()) out.push(`${ref}: text is empty; to remove an entry, use propose_delete.`);
      else if (next.rec.text.length > MAX_JOURNAL_CHARS) out.push(`${ref}: text is ${next.rec.text.length} characters; keep it under ${MAX_JOURNAL_CHARS}.`);
      break;
    case 'sleep': {
      const s = next.rec;
      if (s.end !== undefined && s.end <= s.start) out.push(`${ref}: end must be after start (check the dates).`);
      else if (s.end !== undefined && s.end - s.start > MAX_SLEEP_MS) out.push(`${ref}: the sleep would be ${Math.round((s.end - s.start) / 3_600_000)} hours long; check the dates.`);
      const clash = [...recent.byRef].find(([other, r]) => other !== ref && r.kind === 'sleep' && overlaps(r.rec, s));
      if (clash) out.push(`${ref} would overlap sleep ${clash[0]}; change that one too, or propose_delete it if the user wants it gone.`);
      break;
    }
    case 'activity':
      if (!(next.rec.minutes > 0) || next.rec.minutes > MAX_ACTIVITY_MINUTES) out.push(`${ref}: minutes must be more than 0 and at most ${MAX_ACTIVITY_MINUTES}.`);
      break;
    case 'water':
      if (!(next.rec.ml > 0) || next.rec.ml > MAX_WATER_ML) out.push(`${ref}: ml must be more than 0 and at most ${MAX_WATER_ML}.`);
      break;
    case 'weight':
      if (!(next.rec.kg >= MIN_WEIGHT_KG && next.rec.kg <= MAX_WEIGHT_KG)) out.push(`${ref}: ${next.rec.kg} kg is not a plausible body weight (expected ${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG} kg).`);
      break;
    case 'bloodPressure': {
      const p = bpProblem(next.rec);
      if (p === 'systolic') out.push(`${ref}: systolic must be ${BP_INPUT.systolic[0]}–${BP_INPUT.systolic[1]} mmHg.`);
      else if (p === 'diastolic') out.push(`${ref}: diastolic must be ${BP_INPUT.diastolic[0]}–${BP_INPUT.diastolic[1]} mmHg.`);
      else if (p === 'pulse') out.push(`${ref}: pulse must be ${BP_INPUT.pulse[0]}–${BP_INPUT.pulse[1]} per minute, or 0 to take it off.`);
      else if (p === 'order') out.push(`${ref}: systolic must be higher than diastolic; check whether they are swapped.`);
      break;
    }
    case 'ketone':
      if (!(next.rec.value >= 0) || next.rec.value > MAX_KETONE[next.rec.type]) out.push(`${ref}: value ${next.rec.value} is not a plausible ${next.rec.type} reading (0 to ${MAX_KETONE[next.rec.type]}).`);
      break;
    case 'habit':
      break;
  }
  return out;
}

/** Check a `propose_change` call: refs from the list, fields the entry has, values that make sense, and something that really changes. */
export function validateChangeProposal(input: unknown, recent: RecentContext, now?: number): { ok: true; proposal: ChangeProposal } | { ok: false; error: string } {
  const parsed = changeProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `${issues(parsed.error)}\nEach edit takes a ref and only the fields that change. Fix this and call propose_change again.` };
  const problems: string[] = [];
  const edits: ChangeProposal['edits'] = [];
  const seen = new Set<string>();
  if (!parsed.data.edits.length) problems.push('edits is empty: give at least one ref and what changes.');
  if (parsed.data.edits.length > MAX_EDITS) problems.push(`${parsed.data.edits.length} edits on one card; at most ${MAX_EDITS}.`);
  for (const raw of parsed.data.edits) {
    const ref = raw.ref.trim();
    const { record, problem } = lookup(ref, recent);
    if (!record) {
      problems.push(problem!);
      continue;
    }
    if (seen.has(ref)) {
      problems.push(`${ref} is given twice; put all its changes in one edit.`);
      continue;
    }
    seen.add(ref);
    const patch: EditPatch = {};
    const given: string[] = [];
    const time = (field: 'time' | 'start' | 'end', text: string | undefined) => {
      const v = blank(text);
      if (v === undefined) return;
      given.push(field);
      const t = checkTime(v, now);
      if (t.problem) problems.push(`${ref} ${field}: ${t.problem}`);
      else if (t.time !== undefined) patch[field] = t.time;
    };
    // An activity's start is its time; either word works.
    if (record.kind === 'activity' && blank(raw.start) && !blank(raw.time)) time('time', raw.start);
    else time('start', raw.start);
    time('time', raw.time);
    time('end', raw.end);
    for (const k of ['grams', 'pieces', 'portions', 'servings', 'minutes', 'ml', 'kg', 'systolic', 'diastolic', 'pulse', 'value'] as const) {
      const v = raw[k];
      if (v === undefined) continue;
      given.push(k);
      patch[k] = k === 'kg' || k === 'grams' || k === 'value' || k === 'portions' || k === 'servings' ? Math.round(v * 10) / 10 : Math.round(v);
    }
    if (raw.intensity) {
      given.push('intensity');
      patch.intensity = raw.intensity;
    }
    const text = blank(raw.text);
    if (text !== undefined) {
      given.push('text');
      patch.text = text;
    }
    if (raw.did !== undefined) {
      given.push('did');
      patch.did = raw.did;
    }
    const allowed = editableFields(record);
    const wrong = given.filter((f) => !allowed.includes(f as keyof EditPatch) && !(record.kind === 'activity' && f === 'start'));
    if (wrong.length) {
      problems.push(`${ref} (${record.kind === 'log' ? `${record.rec.kind} entry` : record.kind}) cannot change ${wrong.join(', ')}; it takes ${allowed.join(', ')}.${record.kind === 'log' ? ' To swap a food for another, propose_delete the entry and propose_meal the right food.' : ''}`);
      continue;
    }
    if (!given.length) {
      problems.push(`${ref}: no field to change; give only the fields that change.`);
      continue;
    }
    const next = applyEdit(record, patch);
    if (sameRecord(record, next)) {
      problems.push(`${ref} already has these values; leave it out.`);
      continue;
    }
    const wrongResult = resultProblems(ref, next, recent);
    if (wrongResult.length) {
      problems.push(...wrongResult);
      continue;
    }
    edits.push({ ...targetOf(ref, record), patch });
  }
  const reason = blank(parsed.data.reason);
  if (reason && reason.length > MAX_REASON_CHARS) problems.push(`reason is ${reason.length} characters; keep it to one short line.`);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_change again.` };
  const replaces = blank(parsed.data.replaces);
  return { ok: true, proposal: { edits, ...(reason ? { reason } : {}), ...(replaces ? { replaces } : {}) } };
}

/** Check a `propose_delete` call: refs from the list, still saved, each once. */
export function validateDeleteProposal(input: unknown, recent: RecentContext): { ok: true; proposal: DeleteProposal } | { ok: false; error: string } {
  const parsed = deleteProposalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: `${issues(parsed.error)}\nFix this and call propose_delete again.` };
  const problems: string[] = [];
  const targets: EditTarget[] = [];
  const refs = parsed.data.refs.map((r) => r.trim()).filter(Boolean);
  if (!refs.length) problems.push('refs is empty: give the refs of the entries to delete.');
  if (refs.length > MAX_EDITS) problems.push(`${refs.length} entries on one card; at most ${MAX_EDITS}.`);
  for (const ref of new Set(refs)) {
    const { record, problem } = lookup(ref, recent);
    if (record) targets.push(targetOf(ref, record));
    else problems.push(problem!);
  }
  const reason = blank(parsed.data.reason);
  if (reason && reason.length > MAX_REASON_CHARS) problems.push(`reason is ${reason.length} characters; keep it to one short line.`);
  if (problems.length) return { ok: false, error: `${problems.join('\n')}\nFix these and call propose_delete again.` };
  const replaces = blank(parsed.data.replaces);
  return { ok: true, proposal: { targets, ...(reason ? { reason } : {}), ...(replaces ? { replaces } : {}) } };
}
