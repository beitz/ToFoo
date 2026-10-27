/** Browser glue for the assistant: the API client, its settings on the device, and error texts. */
import { isStaleBuildError } from '../app/staleBuild';
import { markReloadNeeded } from '../app/update';
import { repo } from '../storage/repo';
import { diag } from '../app/diagnostics';
import { errorText } from '../lib/shareFile';
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
  // Streamed and collected: a long answer (many cards at once) would hit the SDK's time limit for
  // a single unstreamed request.
  return async (params) => (await client).beta.messages.stream(params).finalMessage();
}

export type AiErrorKind = 'auth' | 'rateLimit' | 'overloaded' | 'network' | 'webSearchOff' | 'rejected' | 'app' | 'update' | 'other';

/** What went wrong, for the user (kind picks the message) and in full (detail: status, type, the service's own words). */
export interface AiFailure {
  kind: AiErrorKind;
  detail: string;
}

/** Mid-answer errors arrive in the stream without an HTTP status; their type says what happened. */
const STREAM_ERROR_KIND: Record<string, AiErrorKind> = {
  overloaded_error: 'overloaded',
  api_error: 'overloaded',
  rate_limit_error: 'rateLimit',
  authentication_error: 'auth',
  permission_error: 'auth',
};

/** The message the API itself gave (`{type: 'error', error: {type, message}}`), if any. */
function apiMessage(body: unknown): string | undefined {
  const inner = (body as { error?: { message?: unknown } } | undefined)?.error;
  const msg = inner?.message ?? (body as { message?: unknown } | undefined)?.message;
  return typeof msg === 'string' && msg.trim() ? msg.trim() : undefined;
}

/**
 * Sort a failed request into what the user can do about it, and spell out the cause in full.
 * The SDK is already loaded when a request has failed, so importing it here costs nothing.
 */
export async function describeAiError(e: unknown): Promise<AiFailure> {
  // The app was updated while open and the SDK's file is gone: a reload, not the connection.
  if (isStaleBuildError(e)) {
    markReloadNeeded();
    return { kind: 'update', detail: errorText(e) };
  }
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    // Offline before the SDK was ever loaded.
    return { kind: 'network', detail: errorText(e) };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    const cause = e.cause instanceof Error && e.cause.message !== e.message ? ` (${e.cause.message})` : '';
    return { kind: 'network', detail: `${e.message}${cause}` };
  }
  if (e instanceof Anthropic.APIError) {
    const type = e.type ?? (e.error as { error?: { type?: string } } | undefined)?.error?.type ?? undefined;
    const said = apiMessage(e.error) ?? e.message;
    const detail = [e.status ? `HTTP ${e.status}` : 'Error during the answer', type, said].filter(Boolean).join(' · ') + (e.requestID ? ` (request ${e.requestID})` : '');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { kind: 'auth', detail };
    if (e instanceof Anthropic.RateLimitError) return { kind: 'rateLimit', detail };
    // An organization admin can turn web search off in the Anthropic console; requests offering it then fail.
    if (e instanceof Anthropic.BadRequestError && /web search/i.test(said)) return { kind: 'webSearchOff', detail };
    if (e.status === undefined) return { kind: (type && STREAM_ERROR_KIND[type]) || 'other', detail };
    if (e.status >= 500) return { kind: 'overloaded', detail };
    // Any other 4xx: the service turned this request down, and its message says why.
    return { kind: 'rejected', detail };
  }
  // The SDK's own complaints (e.g. a stream that ended early) versus a fault in the app's own code.
  if (e instanceof Anthropic.AnthropicError) return { kind: 'other', detail: errorText(e) };
  return { kind: 'app', detail: errorText(e) };
}

/**
 * Keep a failure in the diagnostics log (Settings → About → Diagnostics), so it can be traced
 * later even when the chat was closed. For a fault in the app, the first stack lines say where.
 */
export function logAiError(where: string, model: string, failure: { kind: string; detail?: string }, e?: unknown): void {
  const stack = failure.kind === 'app' && e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : undefined;
  diag('ai.error', { where, model, kind: failure.kind, ...(failure.detail ? { detail: failure.detail } : {}), ...(stack ? { stack } : {}) });
}
