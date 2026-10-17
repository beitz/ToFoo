/**
 * Long recordings are split into parts before they go to the speech service: gpt-4o-transcribe
 * writes at most 2,000 tokens per request, so one recording longer than about 8–9 minutes comes
 * back cut off without an error. Parts are cut at a pause in speech, so no word is split, and each
 * part is typed up while the user keeps talking.
 */

/** A part may be cut from this length on, at the next pause: well under the output limit. */
export const SEGMENT_TARGET_MS = 2 * 60_000;
/** Cut here even without a pause (about 600 words of fast speech, still under the limit). */
export const SEGMENT_MAX_MS = 4 * 60_000;
/** Quiet this long counts as a pause between sentences. */
export const PAUSE_MS = 600;
/** RMS level (of a −1…1 signal) below which the microphone counts as quiet: about −40 dBFS. */
export const QUIET_RMS = 0.01;

/** Whether to end the current part now. */
export function shouldCut(partMs: number, quietMs: number): boolean {
  return partMs >= SEGMENT_MAX_MS || (partMs >= SEGMENT_TARGET_MS && quietMs >= PAUSE_MS);
}

/** Root mean square of audio samples. */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length);
}

/**
 * Context for the speech model when typing up a later part: the end of the text so far, so a
 * sentence that runs across the cut and names said earlier come out right.
 */
export function promptWithContext(prompt: string, previous: string, maxChars = 400): string {
  const tail = previous.trim().slice(-maxChars);
  return tail ? `${prompt}\n\nThe recording so far ends with: ${tail}` : prompt;
}

/** Join the text of a new part to what is already there: on the same line for a part of the same recording. */
export function appendText(old: string, added: string, continued = false): string {
  if (!old.trim()) return added;
  return continued ? `${old.trimEnd()} ${added}` : `${old.trimEnd()}\n${added}`;
}
