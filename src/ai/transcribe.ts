/**
 * Voice input for the assistant chat: a recording goes to OpenAI's transcription API with the
 * user's own OpenAI key and comes back as text in the chat box, for the user to check before
 * sending. The Claude API takes no audio, so this is a separate, opt-in service.
 */
import { repo } from '../storage/repo';

/** Device-only, like the Anthropic key: the meta table is not exported in backups. */
const KEY_META = 'voice:openaiKey';

export const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
export const TRANSCRIBE_MODEL = 'gpt-4o-transcribe';
/** Upload limit of the transcription API. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Context for the speech model: the setting and vocabulary it will hear, which helps with food
 * names and mixed German and English. Not an instruction; the model only transcribes.
 */
export const TRANSCRIBE_PROMPT =
  'Someone describing what they ate for a food diary, in German or English or both, often looking at their meal photos. Food names, brands, amounts in grams, times of day.';
/** The same for journal entries: how the day went, how they feel, sleep, symptoms, food. */
export const JOURNAL_TRANSCRIBE_PROMPT =
  'Someone speaking a personal journal entry, in German or English or both: how their day went, how they feel, sleep, energy, symptoms, food, times of day.';

export async function getOpenAiKey(): Promise<string> {
  return (await repo.getMeta<string>(KEY_META)) ?? '';
}

export async function setOpenAiKey(key: string): Promise<void> {
  await repo.setMeta(KEY_META, key.trim());
}

export type TranscribeError = 'auth' | 'rateLimit' | 'overloaded' | 'network' | 'tooLong' | 'other';

export type TranscribeResult = { ok: true; text: string } | { ok: false; error: TranscribeError };

export function errorForStatus(status: number): TranscribeError {
  if (status === 401 || status === 403) return 'auth';
  if (status === 413) return 'tooLong';
  if (status === 429) return 'rateLimit';
  if (status >= 500) return 'overloaded';
  return 'other';
}

/** File name with an extension the API recognises, from the recorder's MIME type. */
export function audioFileName(mimeType: string): string {
  const type = mimeType.split(';')[0]!.trim();
  const ext = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }[type];
  return `recording.${ext ?? 'webm'}`;
}

/** Send one recording; `fetchFn` is injected so this can be tested without a network. */
export async function transcribe(audio: Blob, apiKey: string, fetchFn: typeof fetch = fetch, prompt: string = TRANSCRIBE_PROMPT): Promise<TranscribeResult> {
  if (audio.size > MAX_AUDIO_BYTES) return { ok: false, error: 'tooLong' };
  const form = new FormData();
  form.append('file', audio, audioFileName(audio.type));
  form.append('model', TRANSCRIBE_MODEL);
  form.append('prompt', prompt);
  form.append('response_format', 'json');
  let res: Response;
  try {
    res = await fetchFn(TRANSCRIBE_URL, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  } catch {
    return { ok: false, error: 'network' };
  }
  if (!res.ok) return { ok: false, error: errorForStatus(res.status) };
  try {
    const body = (await res.json()) as { text?: unknown };
    return typeof body.text === 'string' ? { ok: true, text: body.text.trim() } : { ok: false, error: 'other' };
  } catch {
    return { ok: false, error: 'other' };
  }
}
