/**
 * The assistant conversation loop: send the user's message, run the tools the model calls, and
 * stop when it asks the user something (plain text) or proposes a meal (or, in the recipe editor,
 * ingredients). The API call is injected
 * so the loop can be tested without a network.
 */
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { systemPromptFor, toolsFor, type PromptSources } from './prompt';
import { usageOf, type ModelTokens } from './pricing';
import { fmtLocalDateTime } from './photoTime';
import {
  runLookupBarcode,
  runSearchFoods,
  runSearchUsda,
  sourcesOf,
  validateJournalProposal,
  validateProposal,
  validateSleepProposal,
  validateActivityProposal,
  validateWaterProposal,
  validateIngredientsProposal,
  validateRecipeProposal,
  validatePortionProposal,
  validateBatchProposal,
  runListRecipes,
  runNutrientGaps,
  runCheckRecipe,
  type IngredientsProposal,
  type RecipeProposal,
  type PortionProposal,
  type BatchProposal,
  type JournalProposal,
  type Proposal,
  type SleepProposal,
  type ActivityProposal,
  type WaterProposal,
  type ToolContext,
} from './tools';

export type CreateMessage = (params: Beta.MessageCreateParamsNonStreaming) => Promise<Beta.BetaMessage>;

export const AI_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type AiModel = (typeof AI_MODELS)[number];
export const DEFAULT_AI_MODEL: AiModel = 'claude-opus-5-5';

/**
 * Tool rounds per user message before giving up: a normal meal needs one to three; a long message
 * covering a day or two (searches, barcodes, a correction after a rejected proposal) needs more,
 * and recipe ideas add a check of each idea, sometimes twice.
 */
const MAX_STEPS = 30;

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
  /** Sleep cards shown so far; the next one gets id S(sleeps + 1). */
  sleeps?: number;
  /** Activity cards shown so far; the next one gets id A(activities + 1). */
  activities?: number;
  /** Water cards shown so far; the next one gets id W(waters + 1). */
  waters?: number;
  /** Ingredient cards (recipe editor) or recipe cards (main chat) shown so far; the next one gets id R(recipes + 1). */
  recipes?: number;
  /** Servings from stock shown so far; the next one gets id P(portions + 1). */
  portions?: number;
  /** Cooked batches shown so far; the next one gets id B(batches + 1). */
  batches?: number;
  /** User messages with photos, each with the cards proposed after it (see retirePhotos). */
  photoTurns?: PhotoTurn[];
}

/** A user message with photos (its index in messages) and the cards proposed after it, until the next one. */
export interface PhotoTurn {
  message: number;
  cards: string[];
}

export const emptyConversation = (): Conversation => ({ messages: [], pendingResults: [], cards: 0, notes: 0, sleeps: 0, activities: 0, waters: 0, recipes: 0, portions: 0, batches: 0, photoTurns: [] });

const RETIRED_PHOTO = '[photo removed]';
const RETIRED_NOTE =
  '(App note: the photos of this message were removed from the chat to save cost, because everything proposed from them has been saved. If you need to look at one again, ask the user to send it again.)';

/**
 * Take photos out of the chat once everything proposed from them is saved (or replaced by a
 * correction). Every request resends the whole chat; the cache makes that cheap only for 5
 * minutes, so a reply after a longer break pays for every photo again. Photo labels stay, so the
 * assistant still knows what was there. Recipe ideas do not count: they are not made from photos.
 */
export function retirePhotos(conversation: Conversation, handled: (cardId: string) => boolean): Conversation {
  const turns = conversation.photoTurns ?? [];
  const done = turns.filter((p) => p.cards.length > 0 && p.cards.every(handled));
  if (done.length === 0) return conversation;
  const retire = new Set(done.map((p) => p.message));
  const messages = conversation.messages.map((m, i): Beta.BetaMessageParam => {
    if (!retire.has(i) || typeof m.content === 'string') return m;
    const content = m.content.map((b): Beta.BetaContentBlockParam => (b.type === 'image' ? { type: 'text', text: RETIRED_PHOTO } : b));
    return { ...m, content: [...content, { type: 'text', text: RETIRED_NOTE }] };
  });
  return { ...conversation, messages, photoTurns: turns.filter((p) => !retire.has(p.message)) };
}

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
/** A sleep as shown: with its card id (S1, S2, …). */
export type ShownSleep = SleepProposal & { id: string };
/** An activity as shown: with its card id (A1, A2, …). */
export type ShownActivity = ActivityProposal & { id: string };
/** Plain water as shown: with its card id (W1, W2, …). */
export type ShownWater = WaterProposal & { id: string };
/** Recipe ingredients as shown: with their card id (R1, R2, …). */
export type ShownIngredients = IngredientsProposal & { id: string };
/** A recipe for the book as shown (main chat): with its card id (R1, R2, …). */
export type ShownRecipe = RecipeProposal & { id: string };
/** A serving from stock as shown: with its card id (P1, P2, …). */
export type ShownPortion = PortionProposal & { id: string };
/** A cooked batch as shown: with its card id (B1, B2, …). */
export type ShownBatch = BatchProposal & { id: string };

export type TurnOutcome =
  | { kind: 'reply'; text: string }
  | {
      kind: 'proposal';
      text: string;
      proposals: ShownProposal[];
      notes: ShownNote[];
      sleeps: ShownSleep[];
      activities: ShownActivity[];
      waters: ShownWater[];
      ingredients: ShownIngredients[];
      recipes: ShownRecipe[];
      portions: ShownPortion[];
      batches: ShownBatch[];
      /** Every card id, in the order the assistant proposed them (meals, recipes and trackers mixed). */
      order: string[];
    }
  | { kind: 'error'; reason: 'refusal' | 'tooLong' | 'tooManySteps' };

/** Request parameters per model (fallbacks re-run a declined request on another model). */
export function requestParams(model: AiModel, messages: Beta.BetaMessageParam[], sources: PromptSources = {}): Beta.MessageCreateParamsNonStreaming {
  return {
    model,
    // Streamed (src/ai/client.ts), so a long answer has room: a day or two of meals and journal
    // entries is many cards in one response.
    max_tokens: 64000,
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
  const sources = sourcesOf(ctx);
  let photoTurns = [...(conversation.photoTurns ?? [])];
  if (user.images.length > 0) photoTurns.push({ message: messages.length - 1, cards: [] });

  let cards = conversation.cards;
  let notes = conversation.notes ?? 0;
  let sleeps = conversation.sleeps ?? 0;
  let activities = conversation.activities ?? 0;
  let waters = conversation.waters ?? 0;
  let recipes = conversation.recipes ?? 0;
  let portions = conversation.portions ?? 0;
  let batches = conversation.batches ?? 0;
  const done = (outcome: TurnOutcome, pendingResults: Beta.BetaToolResultBlockParam[] = []) => ({ conversation: { messages, pendingResults, cards, notes, sleeps, activities, waters, recipes, portions, batches, photoTurns }, outcome });

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
    const sleepsProposed: Array<{ id: string; proposal: SleepProposal }> = [];
    const activitiesProposed: Array<{ id: string; proposal: ActivityProposal }> = [];
    const watersProposed: Array<{ id: string; proposal: WaterProposal }> = [];
    const ingredientsProposed: Array<{ id: string; proposal: IngredientsProposal }> = [];
    const recipesProposed: Array<{ id: string; proposal: RecipeProposal }> = [];
    const portionsProposed: Array<{ id: string; proposal: PortionProposal }> = [];
    const batchesProposed: Array<{ id: string; proposal: BatchProposal }> = [];
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
      } else if (use.name === 'propose_ingredients' && sources.recipe) {
        const r = validateIngredientsProposal(use.input, ctx.db, ctx.products);
        if (r.ok) ingredientsProposed.push({ id: use.id, proposal: r.proposal });
        else {
          rejected = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
        }
      } else if (use.name === 'list_recipes' && sources.recipes) {
        const r = runListRecipes(use.input, ctx);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: r.text, is_error: !r.ok });
      } else if (use.name === 'nutrient_gaps' && sources.ideas) {
        const r = runNutrientGaps(ctx);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: r.text, is_error: !r.ok });
      } else if (use.name === 'check_recipe' && sources.ideas) {
        const r = runCheckRecipe(use.input, ctx);
        results.push({ type: 'tool_result', tool_use_id: use.id, content: r.text, is_error: !r.ok });
      } else if (use.name === 'propose_recipe' && sources.recipes) {
        const r = validateRecipeProposal(use.input, ctx);
        if (r.ok) recipesProposed.push({ id: use.id, proposal: r.proposal });
        else {
          rejected = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
        }
      } else if (use.name === 'propose_portion' && sources.recipes) {
        const r = validatePortionProposal(use.input, ctx);
        if (r.ok) portionsProposed.push({ id: use.id, proposal: r.proposal });
        else {
          rejected = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
        }
      } else if (use.name === 'propose_batch' && sources.recipes) {
        const r = validateBatchProposal(use.input, ctx);
        if (r.ok) batchesProposed.push({ id: use.id, proposal: r.proposal });
        else {
          rejected = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
        }
      } else if (use.name === 'propose_meal' && !sources.recipe) {
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
      } else if (use.name === 'propose_sleep' && sources.sleep) {
        const r = validateSleepProposal(use.input, ctx.now);
        if (r.ok) sleepsProposed.push({ id: use.id, proposal: r.proposal });
        else {
          rejected = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
        }
      } else if (use.name === 'propose_activity' && sources.activity) {
        const r = validateActivityProposal(use.input, ctx.now);
        if (r.ok) activitiesProposed.push({ id: use.id, proposal: r.proposal });
        else {
          rejected = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
        }
      } else if (use.name === 'propose_water' && sources.water) {
        const r = validateWaterProposal(use.input, ctx.now);
        if (r.ok) watersProposed.push({ id: use.id, proposal: r.proposal });
        else {
          rejected = true;
          results.push({ type: 'tool_result', tool_use_id: use.id, content: r.error, is_error: true });
        }
      } else {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Unknown tool ${use.name}.`, is_error: true });
      }
    }

    // Cards are shown all together or not at all, so the user never sees half a batch.
    const anyProposed = proposals.length + notesProposed.length + sleepsProposed.length + activitiesProposed.length + watersProposed.length + ingredientsProposed.length + recipesProposed.length + portionsProposed.length + batchesProposed.length > 0;
    if (anyProposed && !rejected) {
      const shown = proposals.map(({ proposal }): ShownProposal => ({ ...proposal, id: `M${++cards}` }));
      const shownNotes = notesProposed.map(({ proposal }): ShownNote => ({ ...proposal, id: `J${++notes}` }));
      const shownSleeps = sleepsProposed.map(({ proposal }): ShownSleep => ({ ...proposal, id: `S${++sleeps}` }));
      const shownActivities = activitiesProposed.map(({ proposal }): ShownActivity => ({ ...proposal, id: `A${++activities}` }));
      const shownWaters = watersProposed.map(({ proposal }): ShownWater => ({ ...proposal, id: `W${++waters}` }));
      const shownIngredients = ingredientsProposed.map(({ proposal }): ShownIngredients => ({ ...proposal, id: `R${++recipes}` }));
      const shownRecipes = recipesProposed.map(({ proposal }): ShownRecipe => ({ ...proposal, id: `R${++recipes}` }));
      const shownPortions = portionsProposed.map(({ proposal }): ShownPortion => ({ ...proposal, id: `P${++portions}` }));
      const shownBatches = batchesProposed.map(({ proposal }): ShownBatch => ({ ...proposal, id: `B${++batches}` }));
      const cardOfUse = new Map<string, string>([
        ...proposals.map(({ id }, i) => [id, shown[i]!.id] as const),
        ...notesProposed.map(({ id }, i) => [id, shownNotes[i]!.id] as const),
        ...sleepsProposed.map(({ id }, i) => [id, shownSleeps[i]!.id] as const),
        ...activitiesProposed.map(({ id }, i) => [id, shownActivities[i]!.id] as const),
        ...watersProposed.map(({ id }, i) => [id, shownWaters[i]!.id] as const),
        ...ingredientsProposed.map(({ id }, i) => [id, shownIngredients[i]!.id] as const),
        ...recipesProposed.map(({ id }, i) => [id, shownRecipes[i]!.id] as const),
        ...portionsProposed.map(({ id }, i) => [id, shownPortions[i]!.id] as const),
        ...batchesProposed.map(({ id }, i) => [id, shownBatches[i]!.id] as const),
      ]);
      const order = uses.map((u) => cardOfUse.get(u.id)).filter((id): id is string => !!id);
      const fromPhotos = order.filter((id) => !shownRecipes.some((r) => r.id === id && r.kind === 'idea'));
      const last = photoTurns[photoTurns.length - 1];
      if (last) photoTurns = [...photoTurns.slice(0, -1), { ...last, cards: [...last.cards, ...fromPhotos] }];
      const shownResult = (id: string, card: string, verb: string): Beta.BetaToolResultBlockParam => ({ type: 'tool_result', tool_use_id: id, content: `Shown to the user as card ${card}. Not ${verb} yet; their reply follows.` });
      const shownResults = [
        ...proposals.map(({ id }, i) => shownResult(id, shown[i]!.id, 'logged')),
        ...notesProposed.map(({ id }, i) => shownResult(id, shownNotes[i]!.id, 'saved')),
        ...sleepsProposed.map(({ id }, i) => shownResult(id, shownSleeps[i]!.id, 'saved')),
        ...activitiesProposed.map(({ id }, i) => shownResult(id, shownActivities[i]!.id, 'saved')),
        ...watersProposed.map(({ id }, i) => shownResult(id, shownWaters[i]!.id, 'saved')),
        ...ingredientsProposed.map(({ id }, i) => shownResult(id, shownIngredients[i]!.id, 'added to the recipe')),
        ...recipesProposed.map(({ id }, i) => shownResult(id, shownRecipes[i]!.id, 'saved')),
        ...portionsProposed.map(({ id }, i) => shownResult(id, shownPortions[i]!.id, 'logged')),
        ...batchesProposed.map(({ id }, i) => shownResult(id, shownBatches[i]!.id, 'saved')),
      ];
      return done(
        {
          kind: 'proposal',
          text: textOf(res.content),
          proposals: shown,
          notes: shownNotes,
          sleeps: shownSleeps,
          activities: shownActivities,
          waters: shownWaters,
          ingredients: shownIngredients,
          recipes: shownRecipes,
          portions: shownPortions,
          batches: shownBatches,
          order,
        },
        [...results, ...shownResults],
      );
    }
    for (const { id } of proposals) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_meal again for this meal too.', is_error: true });
    }
    for (const { id } of notesProposed) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_journal_entry again for this entry too.', is_error: true });
    }
    for (const { id } of sleepsProposed) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_sleep again for this sleep too.', is_error: true });
    }
    for (const { id } of watersProposed) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_water again for this water too.', is_error: true });
    }
    for (const { id } of activitiesProposed) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_activity again for this activity too.', is_error: true });
    }
    for (const { id } of recipesProposed) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_recipe again for this recipe too.', is_error: true });
    }
    for (const { id } of portionsProposed) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_portion again for this serving too.', is_error: true });
    }
    for (const { id } of batchesProposed) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_batch again for this batch too.', is_error: true });
    }
    for (const { id } of ingredientsProposed) {
      results.push({ type: 'tool_result', tool_use_id: id, content: 'Not shown: another proposal in this response had errors. Call propose_ingredients again for these ingredients too.', is_error: true });
    }
    messages.push({ role: 'user', content: results });
  }
  return done({ kind: 'error', reason: 'tooManySteps' });
}

/** The system prompt and tools a request with this context carries (kept with saved chats). */
export function chatSetup(ctx: ToolContext): { system: string; tools: unknown[] } {
  const sources = sourcesOf(ctx);
  return { system: systemPromptFor(sources), tools: toolsFor(sources) };
}

/** The recipe being edited, as the recipe editor's assistant is told about it. */
export interface RecipeSoFar {
  name: string;
  portions?: number;
  /** One line per ingredient, e.g. "Red lentils, dried 250 g, boiled". */
  ingredients: string[];
  /** The preparation steps so far. */
  instructions?: string;
}

/**
 * The app's note on each user message: the current time and the chat's day (so "yesterday" and
 * photo times can be placed), cards already logged or still open, barcodes read from photos, and
 * whether the text was dictated. In the recipe editor: what the recipe already has instead of the day.
 */
export function appNote(o: { now: number; day: string; today: string; logged: string[]; open: string[]; barcodes: string[]; dictated?: boolean; recipe?: RecipeSoFar }): string {
  const parts = [`Now: ${fmtLocalDateTime(o.now)}.`];
  if (o.dictated) parts.push('The text was spoken and turned into text by a speech model: expect misheard words, especially food and brand names, and corrections the user made while talking.');
  if (o.recipe) {
    const r = o.recipe;
    const head = [r.name ? `name "${r.name}"` : 'no name yet', r.portions ? `${r.portions} portions` : 'portions not set'].join(', ');
    parts.push(`The recipe in the editor: ${head}; ${r.ingredients.length ? `ingredients: ${r.ingredients.join('; ')}` : 'no ingredients yet'}; ${r.instructions?.trim() ? `steps:\n${r.instructions.trim()}\n` : 'no steps yet.'}`);
  } else if (o.day !== o.today) parts.push(`The user opened this chat for ${o.day}.`);
  if (o.logged.length) parts.push(`Cards already ${o.recipe ? 'added to the recipe' : 'logged'}: ${o.logged.join(', ')}.`);
  if (o.open.length) parts.push(`Cards still open: ${o.open.join(', ')}.`);
  if (o.barcodes.length) parts.push(`Barcodes the app read from the photos: ${o.barcodes.join(', ')}.`);
  return `(${parts.join(' ')})`;
}
