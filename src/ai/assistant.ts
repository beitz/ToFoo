/**
 * The assistant conversation loop: send the user's message, run the tools the model calls, and
 * stop when it asks the user something (plain text) or proposes a meal. The API call is injected
 * so the loop can be tested without a network.
 */
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { systemPromptFor, toolsFor, type PromptSources } from './prompt';
import { usageOf, type ModelTokens } from './pricing';
import { fmtLocalDateTime } from './photoTime';
import { runLookupBarcode, runSearchFoods, runSearchUsda, sourcesOf, validateJournalProposal, validateProposal, type JournalProposal, type Proposal, type ToolContext } from './tools';

export type CreateMessage = (params: Beta.MessageCreateParamsNonStreaming) => Promise<Beta.BetaMessage>;

export const AI_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type AiModel = (typeof AI_MODELS)[number];
export const DEFAULT_AI_MODEL: AiModel = 'claude-opus-5-5';

/** Tool rounds per user message before giving up: a normal meal needs one to three, a batch of meals a few more. */
const MAX_STEPS = 12;

export interface Conversation {
  messages: Beta.BetaMessageParam[];
  /**
   * Tool results still owed to the model: when it proposes a meal the loop stops for the user,
   * and the results go out with the user's next message.
   */
  pendingResults: Beta.BetaToolResultBlockParam[];
  /** Cards shown so far; the next one gets id M(cards + 1). */
  cards: number;
  /** Journal cards shown so far; the next one gets id J(notes + 1). */
  notes: number;
}

export const emptyConversation = (): Conversation => ({ messages: [], pendingResults: [], cards: 0, notes: 0 });

export interface UserImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Base64 without the data-URL prefix. */
  data: string;
  /** Sent as text right before the photo, e.g. its number and capture time. */
  label?: string;
}

/** A proposal as shown: with the card id the assistant uses to refer to it. */
export type ShownProposal = Proposal & { id: string };
/** A journal entry as shown: with its card id (J1, J2, …). */
export type ShownNote = JournalProposal & { id: string };

export type TurnOutcome =
  | { kind: 'reply'; text: string }
  | { kind: 'proposal'; text: string; proposals: ShownProposal[]; notes: ShownNote[] }
  | { kind: 'error'; reason: 'refusal' | 'tooLong' | 'tooManySteps' };

/** Request parameters per model (fallbacks re-run a declined request on another model). */
export function requestParams(model: AiModel, messages: Beta.BetaMessageParam[], sources: PromptSources = {}): Beta.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 16000,
    system: systemPromptFor(sources),
    tools: toolsFor(sources),
    messages,
    cache_control: { type: 'ephemeral' },
    output_config: { effort: 'medium' },
    // Server-side fallback is offered for Opus and Sonnet, not Haiku.
    ...(model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
  };
}

/**
 * The visible text of a response. Text blocks that follow each other directly are one passage (a
 * web search answer splits text at every citation); text separated by tool calls is a new paragraph.
 */
export function textOf(content: Beta.BetaContentBlock[]): string {
  const parts: string[] = [];
  let joined = false;
  for (const b of content) {
    if (b.type === 'text') {
      if (joined) parts[parts.length - 1] += b.text;
      else parts.push(b.text);
      joined = true;
    } else joined = false;
  }
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');
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
    ...user.images.flatMap((img): Beta.BetaContentBlockParam[] => [
      ...(img.label ? [{ type: 'text' as const, text: img.label }] : []),
      { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
    ]),
  ];
  if (user.text.trim()) content.push({ type: 'text', text: user.text.trim() });
  if (user.appNote) content.push({ type: 'text', text: user.appNote });
  messages.push({ role: 'user', content });
  const sources = sourcesOf(ctx.products, ctx.journal);

  let cards = conversation.cards;
  let notes = conversation.notes ?? 0;
  const done = (outcome: TurnOutcome, pendingResults: Beta.BetaToolResultBlockParam[] = []) => ({ conversation: { messages, pendingResults, cards, notes }, outcome });

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await create(requestParams(model, messages, sources));
    onUsage?.(usageOf(res, model));
    // Append the whole content (thinking and fallback blocks included) so the next request replays it unchanged.
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'refusal') return done({ kind: 'error', reason: 'refusal' });
    if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded') return done({ kind: 'error', reason: 'tooLong' });
    // A long web search can pause; sending the conversation back as it is lets it carry on.
    if (res.stop_reason === 'pause_turn') continue;

    const uses = res.content.filter((b): b is Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (uses.length === 0) return done({ kind: 'reply', text: textOf(res.content) });

    const results: Beta.BetaToolResultBlockParam[] = [];
    const proposals: Array<{ id: string; proposal: Proposal }> = [];
    const notesProposed: Array<{ id: string; proposal: JournalProposal }> = [];
    let rejected = false;
    for (const use of uses) {
      if (use.name === 'search_foods') {
        const r = runSearchFoods(use.input, ctx);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: r.text, is_error: !r.ok });
      } else if (use.name === 'lookup_barcode' && sources.off) {
        const r = await runLookupBarcode(use.input, ctx);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: r.text, is_error: !r.ok });
      } else if (use.name === 'search_usda' && sources.usda) {
        const r = await runSearchUsda(use.input, ctx);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: r.text, is_error: !r.ok });
      } else if (use.name === 'propose_meal') {
        const r = validateProposal(use.input, ctx.db, ctx.products, ctx.now);
        if (r.ok) proposals.push({ id: use.id, proposal: r.proposal });
        else {
          rejected = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
        }
      } else if (use.name === 'propose_journal_entry' && sources.journal) {
        const r = validateJournalProposal(use.input, ctx.now);
        if (r.ok) notesProposed.push({ id: use.id, proposal: r.proposal });
        else {
          rejected = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
        }
      } else {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Unknown tool ${use.name}.`, is_error: true });
      }
    }

    // Cards are shown all together or not at all, so the user never sees half a batch.
    if ((proposals.length || notesProposed.length) && !rejected) {
      const shown = proposals.map(({ proposal }): ShownProposal => ({ ...proposal, id: `M${++cards}` }));
      const shownNotes = notesProposed.map(({ proposal }): ShownNote => ({ ...proposal, id: `J${++notes}` }));
      const shownResults = [
        ...proposals.map(({ id }, i): Beta.BetaToolResultBlockParam => ({ type: 'tool_result', tool_use_id: id, content: `Shown to the user as card ${shown[i]!.id}. Not logged yet; their reply follows.` })),
        ...notesProposed.map(({ id }, i): Beta.BetaToolResultBlockParam => ({ type: 'tool_result', tool_use_id: id, content: `Shown to the user as card ${shownNotes[i]!.id}. Not saved yet; their reply follows.` })),
      ];
      return done({ kind: 'proposal', text: textOf(res.content), proposals: shown, notes: shownNotes }, [...results, ...shownResults]);
    }
    for (const { id } of proposals) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_meal again for this meal too.', is_error: true });
    }
    for (const { id } of notesProposed) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_journal_entry again for this entry too.', is_error: true });
    }
    messages.push({ role: 'user', content: results });
  }
  return done({ kind: 'error', reason: 'tooManySteps' });
}

/**
 * The app's note on each user message: the current time and the chat's day (so "yesterday" and
 * photo times can be placed), cards already logged or still open, and barcodes read from photos.
 */
export function appNote(o: { now: number; day: string; today: string; logged: string[]; open: string[]; barcodes: string[] }): string {
  const parts = [`Now: ${fmtLocalDateTime(o.now)}.`];
  if (o.day !== o.today) parts.push(`The user opened this chat for ${o.day}.`);
  if (o.logged.length) parts.push(`Cards already logged: ${o.logged.join(', ')}.`);
  if (o.open.length) parts.push(`Cards still open: ${o.open.join(', ')}.`);
  if (o.barcodes.length) parts.push(`Barcodes the app read from the photos: ${o.barcodes.join(', ')}.`);
  return `(${parts.join(' ')})`;
}
