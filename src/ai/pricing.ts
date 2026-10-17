/**
 * What the assistant costs: token counts from each API response times Anthropic's list prices.
 * Pure functions. The result is an estimate; the real bill is in the Anthropic console (reading
 * it needs an admin key, which a normal API key is not).
 */
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';

export interface TokenCounts {
  /** Uncached input. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  /** Web searches (billed per search, on top of tokens). Absent in usage stored before searches existed. */
  webSearches?: number;
}

export const ZERO_TOKENS: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };

/** Tokens per model for one or more requests. */
export type ModelTokens = Record<string, TokenCounts>;

interface Price {
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheRead: number;
  /** Prompts above `long.from` tokens are billed at the `long` rates (Haiku 5.5). */
  long?: { from: number; input: number; output: number };
}

/**
 * Anthropic list prices in USD per million tokens, as published in October 2026
 * (https://platform.claude.com/docs/en/about-claude/pricing, checked 2026-10-16). Cache reads as
 * listed there; cache writes are 1.25× input (5-minute cache) and 2× input (1-hour cache) for
 * every model. Models the
 * assistant does not offer are listed because a server-side fallback can answer with them.
 * Update this table when prices change; past usage is re-priced from the stored token counts.
 */
export const PRICES_AS_OF = '2026-10';
/**
 * Web search: USD 10 per 1,000 searches, plus the tokens of the results
 * (https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool, checked 2026-10-17).
 */
const WEB_SEARCH_USD = 10 / 1000;
const PRICES: Record<string, Price> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, long: { from: 100_000, input: 0.5, output: 2.5 } },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

/** Model ids can carry a date suffix (claude-opus-4-8-20260101): match the longest known prefix. */
function priceFor(model: string): Price | undefined {
  if (PRICES[model]) return PRICES[model];
  const key = Object.keys(PRICES)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES[key] : undefined;
}

export const isKnownModel = (model: string): boolean => !!priceFor(model);

/** USD for one request's tokens on one model; unknown models are priced like `fallbackModel`. */
export function requestCost(model: string, t: TokenCounts, fallbackModel: string): number {
  const p = priceFor(model) ?? priceFor(fallbackModel);
  if (!p) return 0;
  const prompt = t.input + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
  const rate = p.long && prompt > p.long.from ? { ...p, input: p.long.input, output: p.long.output, cacheRead: p.long.input * 0.1 } : p;
  const perToken = (usdPerMillion: number) => usdPerMillion / 1_000_000;
  return (
    t.input * perToken(rate.input) +
    t.output * perToken(rate.output) +
    t.cacheRead * perToken(rate.cacheRead) +
    t.cacheWrite5m * perToken(rate.input * 1.25) +
    t.cacheWrite1h * perToken(rate.input * 2) +
    (t.webSearches ?? 0) * WEB_SEARCH_USD
  );
}

export function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  const webSearches = (a.webSearches ?? 0) + (b.webSearches ?? 0);
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite5m: a.cacheWrite5m + b.cacheWrite5m,
    cacheWrite1h: a.cacheWrite1h + b.cacheWrite1h,
    ...(webSearches ? { webSearches } : {}),
  };
}

export function mergeModelTokens(a: ModelTokens, b: ModelTokens): ModelTokens {
  const out: ModelTokens = { ...a };
  for (const [model, t] of Object.entries(b)) out[model] = addTokens(out[model] ?? ZERO_TOKENS, t);
  return out;
}

export const totalTokens = (t: TokenCounts): number => t.input + t.output + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;

/**
 * Billed tokens per model for one API response. With a server-side fallback, `usage.iterations`
 * lists every attempt and is the source of truth (an attempt without a model ran on the requested
 * one); otherwise the top-level usage belongs to the model that answered. Web searches are counted
 * once per response, under the model that answered.
 */
export function usageOf(res: Pick<Beta.BetaMessage, 'model' | 'usage'>, requestedModel: string): ModelTokens {
  const u = res.usage;
  const counts = (x: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number | null; cache_creation_input_tokens: number | null; cache_creation: Beta.BetaCacheCreation | null }): TokenCounts => {
    const write = x.cache_creation_input_tokens ?? 0;
    const write1h = x.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    return { input: x.input_tokens, output: x.output_tokens, cacheRead: x.cache_read_input_tokens ?? 0, cacheWrite5m: Math.max(0, write - write1h), cacheWrite1h: write1h };
  };
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  const withSearches: ModelTokens = searches ? { [res.model]: { ...ZERO_TOKENS, webSearches: searches } } : {};
  const attempts = (u.iterations ?? []).filter((i) => i.type === 'message' || i.type === 'fallback_message');
  if (attempts.some((i) => i.type === 'fallback_message')) {
    let out: ModelTokens = withSearches;
    for (const a of attempts) out = mergeModelTokens(out, { [a.model ?? requestedModel]: counts(a) });
    return out;
  }
  return mergeModelTokens({ [res.model]: counts(u) }, withSearches);
}

export function modelTokensCost(m: ModelTokens, fallbackModel: string): number {
  return Object.entries(m).reduce((sum, [model, t]) => sum + requestCost(model, t, fallbackModel), 0);
}

/** Stored usage: token counts per local day and model (cost is derived, so price fixes apply to the past). */
export interface UsageDay {
  day: string;
  requests: number;
  tokens: ModelTokens;
}

export function recordUsage(ledger: readonly UsageDay[], day: string, tokens: ModelTokens): UsageDay[] {
  const existing = ledger.find((d) => d.day === day);
  const updated: UsageDay = existing ? { day, requests: existing.requests + 1, tokens: mergeModelTokens(existing.tokens, tokens) } : { day, requests: 1, tokens };
  return [...ledger.filter((d) => d.day !== day), updated].sort((a, b) => a.day.localeCompare(b.day));
}

export interface UsageSummary {
  usd: number;
  requests: number;
  tokens: number;
}

/** Totals for days from `fromDay` (inclusive; omit for all time). Day keys sort as strings. */
export function summarize(ledger: readonly UsageDay[], fallbackModel: string, fromDay?: string): UsageSummary {
  return ledger
    .filter((d) => !fromDay || d.day >= fromDay)
    .reduce(
      (s, d) => ({
        usd: s.usd + modelTokensCost(d.tokens, fallbackModel),
        requests: s.requests + d.requests,
        tokens: s.tokens + Object.values(d.tokens).reduce((n, t) => n + totalTokens(t), 0),
      }),
      { usd: 0, requests: 0, tokens: 0 },
    );
}
