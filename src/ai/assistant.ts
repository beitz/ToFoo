/**
 * The assistant conversation loop: send the user's message, run the tools the model calls, and
 * stop when it asks the user something (plain text) or proposes a meal. The API call is injected
 * so the loop can be tested without a network.
 */
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_WITH_PRODUCTS, TOOLS, TOOLS_WITH_PRODUCTS } from './prompt';
import { usageOf, type ModelTokens } from './pricing';
import { runLookupBarcode, runSearchFoods, validateProposal, type Proposal, type ToolContext } from './tools';

export type CreateMessage = (params: Beta.MessageCreateParamsNonStreaming) => Promise<Beta.BetaMessage>;

export const AI_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type AiModel = (typeof AI_MODELS)[number];
export const DEFAULT_AI_MODEL: AiModel = 'claude-opus-5-5';

/** Tool rounds per user message before giving up: a normal meal needs one to three. */
const MAX_STEPS = 8;

export interface Conversation {
  messages: Beta.BetaMessageParam[];
  /**
   * Tool results still owed to the model: when it proposes a meal the loop stops for the user,
   * and the results go out with the user's next message.
   */
  pendingResults: Beta.BetaToolResultBlockParam[];
}

export const emptyConversation = (): Conversation => ({ messages: [], pendingResults: [] });

export interface UserImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Base64 without the data-URL prefix. */
  data: string;
}

export type TurnOutcome =
  | { kind: 'reply'; text: string }
  | { kind: 'proposal'; text: string; proposal: Proposal }
  | { kind: 'error'; reason: 'refusal' | 'tooLong' | 'tooManySteps' };

/** Request parameters per model (fallbacks re-run a declined request on another model). */
export function requestParams(model: AiModel, messages: Beta.BetaMessageParam[], withProducts = false): Beta.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 16000,
    system: withProducts ? SYSTEM_PROMPT_WITH_PRODUCTS : SYSTEM_PROMPT,
    tools: withProducts ? TOOLS_WITH_PRODUCTS : TOOLS,
    messages,
    cache_control: { type: 'ephemeral' },
    output_config: { effort: 'medium' },
    // Server-side fallback is offered for Opus and Sonnet, not Haiku.
    ...(model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
  };
}

function textOf(content: Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n')
    .trim();
}

/** A user message: what they typed and their photos, plus an optional note from the app (e.g. barcodes it read). */
export interface UserMessage {
  text: string;
  images: UserImage[];
  appNote?: string;
}

/**
 * Send one user message (text and/or photos) and run the model until it needs the user again.
 * Returns the updated conversation; the input is not mutated. `onUsage` gets the billed tokens of
 * every API response as it arrives, so usage is counted even if a later request fails.
 */
export async function sendMessage(
  create: CreateMessage,
  model: AiModel,
  conversation: Conversation,
  user: UserMessage,
  ctx: ToolContext,
  onUsage?: (tokens: ModelTokens) => void,
): Promise<{ conversation: Conversation; outcome: TurnOutcome }> {
  const messages = [...conversation.messages];
  const content: Beta.BetaContentBlockParam[] = [
    ...conversation.pendingResults,
    ...user.images.map((img): Beta.BetaImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } })),
  ];
  if (user.text.trim()) content.push({ type: 'text', text: user.text.trim() });
  if (user.appNote) content.push({ type: 'text', text: user.appNote });
  messages.push({ role: 'user', content });
  const withProducts = !!ctx.products;

  const done = (outcome: TurnOutcome, pendingResults: Beta.BetaToolResultBlockParam[] = []) => ({ conversation: { messages, pendingResults }, outcome });

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await create(requestParams(model, messages, withProducts));
    onUsage?.(usageOf(res, model));
    // Append the whole content (thinking and fallback blocks included) so the next request replays it unchanged.
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'refusal') return done({ kind: 'error', reason: 'refusal' });
    if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded') return done({ kind: 'error', reason: 'tooLong' });

    const uses = res.content.filter((b): b is Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (uses.length === 0) return done({ kind: 'reply', text: textOf(res.content) });

    const results: Beta.BetaToolResultBlockParam[] = [];
    let proposal: Proposal | undefined;
    let proposalId = '';
    for (const use of uses) {
      if (use.name === 'search_foods') {
        const r = runSearchFoods(use.input, ctx);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: r.text, is_error: !r.ok });
      } else if (use.name === 'lookup_barcode' && withProducts) {
        const r = await runLookupBarcode(use.input, ctx);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: r.text, is_error: !r.ok });
      } else if (use.name === 'propose_meal') {
        const r = validateProposal(use.input, ctx.db, ctx.products);
        if (r.ok) {
          proposal = r.proposal;
          proposalId = use.id;
        } else results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
      } else {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Unknown tool ${use.name}.`, is_error: true });
      }
    }

    if (proposal) {
      const shown: Beta.BetaToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: proposalId,
        content: 'The proposal was shown to the user. They have not logged it; their reply follows.',
      };
      return done({ kind: 'proposal', text: textOf(res.content), proposal }, [...results, shown]);
    }
    messages.push({ role: 'user', content: results });
  }
  return done({ kind: 'error', reason: 'tooManySteps' });
}
