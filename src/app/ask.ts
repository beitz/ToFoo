import type { ShareKind } from '../logic/insights';
import { takeReloadDraft } from './staleBuild';

/**
 * A question waiting to be typed into the assistant's message box. Question shortcuts put it here
 * and open the assistant; the chat takes it once as its starting text. Never sent by itself: the
 * user always presses Send (owner's rule, 2026-10-22: tapping around must not cost money).
 */
let pending: string | null = null;

/**
 * What a question ticks under Include my data (with Patterns on), so the assistant can read what
 * it is about: the food check needs the food log, and the kitchen (owner's ask, 2026-10-27).
 */
export interface AskData {
  kinds: ShareKind[];
  period: '2w' | '4w' | '3m' | 'all';
  kitchen: boolean;
}
let pendingData: AskData | null = null;

export function setAsk(text: string, data?: AskData): void {
  pending = text;
  pendingData = data ?? null;
}

/** What the waiting question ticks, once; null when nothing. */
export function takeAskData(): AskData | null {
  const data = pendingData;
  pendingData = null;
  return data;
}

/** The waiting question, once, or the message kept over a reload into a new version; null when there is none. */
export function takeAsk(): string | null {
  const text = pending ?? takeReloadDraft();
  pending = null;
  return text;
}
