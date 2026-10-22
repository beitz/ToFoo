/**
 * A question waiting to be typed into the assistant's message box. Question shortcuts put it here
 * and open the assistant; the chat takes it once as its starting text. Never sent by itself: the
 * user always presses Send (owner's rule, 2026-10-22: tapping around must not cost money).
 */
let pending: string | null = null;

export function setAsk(text: string): void {
  pending = text;
}

/** The waiting question, once; null when there is none. */
export function takeAsk(): string | null {
  const text = pending;
  pending = null;
  return text;
}
