import { describe, expect, it } from 'vitest';
import { STRICT_NESTED, systemPromptFor, toolsFor, type PromptSources } from './prompt';

/** Does this JSON schema hold a list of objects (a list of foods, changes, …)? */
function hasObjectList(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) return false;
  const s = schema as Record<string, unknown>;
  if (s.type === 'array' && (s.items as { type?: string } | undefined)?.type === 'object') return true;
  return Object.values(s).some(hasObjectList);
}

describe('toolsFor', () => {
  // Every option on: the largest tool set the main chat and the recipe editor can send.
  const all: PromptSources = { off: true, usda: true, webSearch: true, journal: true, sleep: true, activity: true, water: true, shopping: true, pantry: true, recipes: true, ideas: true, forgotten: true };

  it.each([
    ['main chat', all],
    ['recipe editor', { ...all, recipe: true }],
  ])('keeps the strict grammar small enough for the API (%s)', (_, sources) => {
    const tools = toolsFor(sources) as Array<{ name: string; strict?: boolean; input_schema?: unknown }>;
    const strict = tools.filter((t) => t.strict);
    // The API allows at most 20 strict tools, and rejects a grammar that grows too large (2026-10-19).
    expect(strict.length).toBeLessThanOrEqual(20);
    expect(strict.filter((t) => hasObjectList(t.input_schema)).map((t) => t.name)).toHaveLength(STRICT_NESTED);
  });
});

describe('input of tools that are not strict', () => {
  it('may leave out empty lists and zero amounts', async () => {
    const { recipeProposalInput, portionProposalInput } = await import('./tools');
    expect(recipeProposalInput.parse({ kind: 'own', name: 'Curry', portions: 4, items: [{ code: 'X1', grams: 100, preparation: 'raw' }] })).toMatchObject({ assumptions: [], items: [{ note: '' }] });
    expect(portionProposalInput.parse({ batch_id: 'b1', portions: 1 })).toMatchObject({ grams: 0, changes: [], assumptions: [] });
  });
});

describe('sleep background', () => {
  it('goes with the prompt only while Sleep is on, and the sleep check only with shared data', () => {
    expect(systemPromptFor({ sleep: true })).toContain('Sleep background: what research says');
    expect(systemPromptFor({ sleep: true })).toContain('(Ohayon 2017 (NSF sleep quality recommendations))');
    expect(systemPromptFor({})).not.toContain('Sleep background');
    const names = (s: PromptSources) => (toolsFor(s) as Array<{ name: string }>).map((t) => t.name);
    expect(names({ sleep: true })).not.toContain('sleep_check');
    expect(names({ sleep: true, insights: true })).toContain('sleep_check');
  });
});
