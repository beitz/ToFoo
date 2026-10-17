import { describe, expect, it } from 'vitest';
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { modelTokensCost, recordUsage, requestCost, summarize, usageOf, ZERO_TOKENS, type TokenCounts } from './pricing';

const tokens = (t: Partial<TokenCounts>): TokenCounts => ({ ...ZERO_TOKENS, ...t });
const M = 1_000_000;

describe('requestCost', () => {
  it('prices each token kind at the list price', () => {
    // Opus 5.5: $4 in, $20 out, $0.20 cache read, cache writes 1.25× / 2× input.
    expect(requestCost('claude-opus-5-5', tokens({ input: M }), 'x')).toBeCloseTo(4);
    expect(requestCost('claude-opus-5-5', tokens({ output: M }), 'x')).toBeCloseTo(20);
    expect(requestCost('claude-opus-5-5', tokens({ cacheRead: M }), 'x')).toBeCloseTo(0.2);
    expect(requestCost('claude-opus-5-5', tokens({ cacheWrite5m: M }), 'x')).toBeCloseTo(5);
    expect(requestCost('claude-opus-5-5', tokens({ cacheWrite1h: M }), 'x')).toBeCloseTo(8);
    expect(requestCost('claude-sonnet-5-5', tokens({ cacheRead: M }), 'x')).toBeCloseTo(0.1);
  });

  it('uses the higher Haiku 5.5 rates once the prompt passes 100k tokens, cache included', () => {
    expect(requestCost('claude-haiku-5-5', tokens({ input: 50_000, output: 1000 }), 'x')).toBeCloseTo(0.005 + 0.0005);
    expect(requestCost('claude-haiku-5-5', tokens({ input: 60_000, cacheRead: 50_000, output: 1000 }), 'x')).toBeCloseTo(0.03 + 0.0025 + 0.0025);
  });

  it('matches dated model ids and prices unknown models like the chosen one', () => {
    expect(requestCost('claude-opus-4-8-20260101', tokens({ input: M }), 'x')).toBeCloseTo(5);
    expect(requestCost('claude-unknown-9', tokens({ input: M }), 'claude-sonnet-5-5')).toBeCloseTo(2);
  });
});

describe('usageOf', () => {
  const base = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 300, cache_creation: { ephemeral_5m_input_tokens: 300, ephemeral_1h_input_tokens: 0 } };

  it('reads the top-level usage for a normal answer', () => {
    const u = usageOf({ model: 'claude-opus-5-5', usage: { ...base, iterations: null } as unknown as Beta.BetaUsage }, 'claude-opus-5-5');
    expect(u).toEqual({ 'claude-opus-5-5': { input: 1000, output: 200, cacheRead: 5000, cacheWrite5m: 300, cacheWrite1h: 0 } });
  });

  it('counts every attempt on its own model when a fallback answered', () => {
    const iterations = [
      { type: 'message', model: null, input_tokens: 900, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
      { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
    ];
    const u = usageOf({ model: 'claude-opus-4-8', usage: { ...base, iterations } as unknown as Beta.BetaUsage }, 'claude-opus-5-5');
    expect(u).toEqual({
      'claude-opus-5-5': { input: 900, output: 10, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
      'claude-opus-4-8': { input: 1000, output: 200, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
    });
  });
});

describe('web searches', () => {
  it('counts searches under the answering model and prices them at 1 cent each', () => {
    const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null, iterations: null, server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 } };
    const u = usageOf({ model: 'claude-opus-5-5', usage: usage as unknown as Beta.BetaUsage }, 'claude-opus-5-5');
    expect(u['claude-opus-5-5']).toEqual({ input: 1000, output: 200, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, webSearches: 2 });
    expect(requestCost('claude-opus-5-5', tokens({ webSearches: 3 }), 'x')).toBeCloseTo(0.03);
  });

  it('reads usage stored before searches were counted', () => {
    const ledger = recordUsage([{ day: '2026-10-16', requests: 1, tokens: { 'claude-opus-5-5': tokens({ input: M }) } }], '2026-10-16', { 'claude-opus-5-5': tokens({ webSearches: 1 }) });
    expect(ledger[0]!.tokens['claude-opus-5-5']!.webSearches).toBe(1);
    expect(summarize(ledger, 'claude-opus-5-5').usd).toBeCloseTo(4.01);
  });
});

describe('usage ledger', () => {
  const a = { 'claude-opus-5-5': tokens({ input: M }) };
  const b = { 'claude-haiku-5-5': tokens({ output: M }) };

  it('adds requests per day and model, and sums ranges', () => {
    let ledger = recordUsage([], '2026-10-16', a);
    ledger = recordUsage(ledger, '2026-10-16', a);
    ledger = recordUsage(ledger, '2026-10-01', b);
    expect(ledger.map((d) => [d.day, d.requests])).toEqual([
      ['2026-10-01', 1],
      ['2026-10-16', 2],
    ]);
    expect(summarize(ledger, 'claude-opus-5-5', '2026-10-16')).toEqual({ usd: 8, requests: 2, tokens: 2 * M });
    expect(summarize(ledger, 'claude-opus-5-5').usd).toBeCloseTo(8.5);
    expect(modelTokensCost({ ...a, ...b }, 'x')).toBeCloseTo(4.5);
  });
});
