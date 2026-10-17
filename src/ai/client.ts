/** Browser glue for the assistant: the API client, its settings on the device, and error texts. */
import { repo } from '../storage/repo';
import { dayKey } from '../lib/dates';
import { AI_MODELS, DEFAULT_AI_MODEL, type AiModel, type CreateMessage } from './assistant';
import { recordUsage, type ModelTokens, type UsageDay } from './pricing';

/** Device-only settings: kept in the meta table, which backups do not export. */
const KEY_META = 'ai:apiKey';
const MODEL_META = 'ai:model';
/** Token counts per day and model, for the usage summary in the assistant settings. */
const USAGE_META = 'ai:usage';

export async function getAiSettings(): Promise<{ apiKey: string; model: AiModel }> {
  const [apiKey, model] = await Promise.all([repo.getMeta<string>(KEY_META), repo.getMeta<string>(MODEL_META)]);
  return { apiKey: apiKey ?? '', model: AI_MODELS.find((m) => m === model) ?? DEFAULT_AI_MODEL };
}

export async function setApiKey(key: string): Promise<void> {
  await repo.setMeta(KEY_META, key.trim());
}

export async function setAiModel(model: AiModel): Promise<void> {
  await repo.setMeta(MODEL_META, model);
}

export async function getUsage(): Promise<UsageDay[]> {
  return (await repo.getMeta<UsageDay[]>(USAGE_META)) ?? [];
}

// Writes are chained so two responses arriving close together cannot overwrite each other.
let usageWrite: Promise<void> = Promise.resolve();

export function saveUsage(tokens: ModelTokens, now = new Date()): Promise<void> {
  usageWrite = usageWrite.then(async () => {
    await repo.setMeta(USAGE_META, recordUsage(await getUsage(), dayKey(now), tokens));
  }).catch(() => undefined); // usage stats are a convenience; never break the chat over them
  return usageWrite;
}

export function makeCreate(apiKey: string): CreateMessage {
  // Loaded on first use: the SDK is large and the assistant is off by default.
  const client = import('@anthropic-ai/sdk').then(
    // The user's own key, used only from their own device: the documented case for browser access.
    ({ default: Anthropic }) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 }),
  );
  return async (params) => (await client).beta.messages.create(params);
}

export type AiErrorKind = 'auth' | 'rateLimit' | 'overloaded' | 'network' | 'webSearchOff' | 'other';

/** The SDK is already loaded when a request has failed, so importing it here costs nothing. */
export async function classifyError(e: unknown): Promise<AiErrorKind> {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    return 'network'; // offline before the SDK was ever loaded
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'auth';
  if (e instanceof Anthropic.RateLimitError) return 'rateLimit';
  // An organization admin can turn web search off in the Anthropic console; requests offering it then fail.
  if (e instanceof Anthropic.BadRequestError && /web search/i.test(e.message)) return 'webSearchOff';
  if (e instanceof Anthropic.APIConnectionError) return 'network';
  if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) return 'overloaded';
  return 'other';
}
