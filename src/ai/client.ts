/** Browser glue for the assistant: the API client, its settings on the device, and error texts. */
import { repo } from '../storage/repo';
import { AI_MODELS, DEFAULT_AI_MODEL, type AiModel, type CreateMessage } from './assistant';

/** Device-only settings: kept in the meta table, which backups do not export. */
const KEY_META = 'ai:apiKey';
const MODEL_META = 'ai:model';

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

export function makeCreate(apiKey: string): CreateMessage {
  // Loaded on first use: the SDK is large and the assistant is off by default.
  const client = import('@anthropic-ai/sdk').then(
    // The user's own key, used only from their own device: the documented case for browser access.
    ({ default: Anthropic }) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 }),
  );
  return async (params) => (await client).beta.messages.create(params);
}

export type AiErrorKind = 'auth' | 'rateLimit' | 'overloaded' | 'network' | 'other';

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
  if (e instanceof Anthropic.APIConnectionError) return 'network';
  if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) return 'overloaded';
  return 'other';
}
