import { useEffect } from 'react';
import type { useToast } from '../../app/toast';
import type { RecipeSoFar, ShownActivity, ShownBatch, ShownIngredients, ShownNote, ShownPortion, ShownProposal, ShownHome, ShownRecipe, ShownShopping, ShownSleep, ShownWater, ShownKetone, ShownWeight, ShownHabits } from '../../ai/assistant';
import type { ProposedItem } from '../../ai/tools';
import type { AudioClip } from '../../ai/chatRecord';
import type { Check } from '../../ai/insights';
import { t } from '../../i18n';
import { formatTime } from '../../lib/dates';
import { fmtKg } from '../weight/format';
import { activityName } from '../activity/ActivityForm';
import { spanText } from '../sleep/format';
import { waterText } from '../water/format';
import { KETONE_TYPE_KEY, ketoneValueText } from '../fast/ketoneFormat';

/**
 * A proposed meal (M1, …), journal entry (J1, …), sleep (S1, …), activity (A1, …), water (W1, …), ketone measurement (K1, …), weigh-in (G1, …), habit answers (T1, …),
 * things for the shopping list (L1, …), things bought or running low at home (H1, …),
 * recipe ingredients (R1, …, recipe editor), recipe for the book (R1, …, main chat), serving from
 * stock (P1, …) or cooked batch (B1, …), and whether the user logged, saved or added it.
 */
export type Card =
  | { kind: 'meal'; proposal: ShownProposal; logged: boolean }
  | { kind: 'note'; note: ShownNote; logged: boolean }
  | { kind: 'sleep'; sleep: ShownSleep; logged: boolean }
  | { kind: 'activity'; activity: ShownActivity; logged: boolean }
  | { kind: 'water'; water: ShownWater; logged: boolean }
  | { kind: 'ketone'; ketone: ShownKetone; logged: boolean }
  | { kind: 'weight'; weight: ShownWeight; logged: boolean }
  | { kind: 'habits'; habits: ShownHabits; logged: boolean }
  | { kind: 'shopping'; shopping: ShownShopping; logged: boolean }
  | { kind: 'home'; home: ShownHome; logged: boolean }
  | { kind: 'ingredients'; ingredients: ShownIngredients; logged: boolean }
  | { kind: 'recipe'; recipe: ShownRecipe; logged: boolean }
  | { kind: 'portion'; portion: ShownPortion; logged: boolean }
  | { kind: 'batch'; batch: ShownBatch; logged: boolean };

export function cardOf(c: Card) {
  switch (c.kind) {
    case 'meal':
      return c.proposal;
    case 'note':
      return c.note;
    case 'sleep':
      return c.sleep;
    case 'activity':
      return c.activity;
    case 'water':
      return c.water;
    case 'ketone':
      return c.ketone;
    case 'weight':
      return c.weight;
    case 'habits':
      return c.habits;
    case 'shopping':
      return c.shopping;
    case 'home':
      return c.home;
    case 'ingredients':
      return c.ingredients;
    case 'recipe':
      return c.recipe;
    case 'portion':
      return c.portion;
    case 'batch':
      return c.batch;
  }
}
export const cardId = (c: Card) => cardOf(c).id;

/** A few words naming a card, for the page title and the summary page. */
export function cardTitle(c: Card): string {
  switch (c.kind) {
    case 'meal':
      return c.proposal.summary || t('ai.proposal');
    case 'note': {
      const words = c.note.text.replace(/\s+/g, ' ').trim();
      return `${t('ai.noteTitle')}: ${words.length > 40 ? `${words.slice(0, 39)}…` : words}`;
    }
    case 'sleep':
      return `${t('sleep.short')} · ${spanText(c.sleep)}`;
    case 'activity':
      return `${activityName(c.activity)} · ${formatTime(c.activity.start)}`;
    case 'water':
      return `${t('water.title')} · ${waterText(c.water.ml)}`;
    case 'ketone':
      return `${t('ketone.cardTitle')} · ${ketoneValueText(c.ketone)} (${t(KETONE_TYPE_KEY[c.ketone.type])})`;
    case 'weight':
      return `${t('weight.title')} · ${t('weight.kg', { kg: fmtKg(c.weight.kg) })}`;
    case 'habits':
      return `${t('habits.title')} · ${[...new Set(c.habits.answers.map((a) => a.name))].join(', ')}`;
    case 'shopping':
      return `${t('shopping.title')} · ${[...c.shopping.recipes.map((r) => r.name), ...c.shopping.items.map((i) => i.name)].join(', ')}`;
    case 'home':
      return `${t('pantry.cardTitle')} · ${c.home.items.map((i) => i.name).join(', ')}`;
    case 'ingredients':
      return c.ingredients.name || t('ai.ingredientsTitle');
    case 'recipe':
      return c.recipe.name;
    case 'portion':
      return c.portion.name;
    case 'batch':
      return t(c.batch.batchId ? 'ai.potTitle' : 'ai.batchTitle', { name: c.batch.name });
  }
}

/**
 * A chat bubble; an answer with several cards is one 'pages' bubble, its cards shown as pages.
 * 'checks': the app's own numbers behind a pattern answer, right under it.
 */
export type Bubble =
  | { role: 'user'; text: string; previews: string[]; audio?: AudioClip[] }
  | { role: 'assistant'; text: string }
  | { role: 'card'; id: string }
  | { role: 'pages'; key: number; text: string; ids: string[] }
  | { role: 'checks'; checks: Check[] };

/** Undoes one saved card. */
export type Undo = () => Promise<void>;
/** Saves a card as it is shown (with the user's edits); undefined if it cannot be saved as it is. */
export type Saver = () => Promise<Undo | undefined>;

/** The recipe editor's chat: confirmed cards become ingredients of the recipe being edited. */
export interface RecipeChat {
  /** What the recipe has right now, for the assistant. */
  soFar: () => RecipeSoFar;
  /** Add confirmed ingredients (the name and portions only where the recipe has none yet); returns its undo. */
  add: (p: { name: string; portions?: number; items: ProposedItem[]; instructions?: string }) => () => void;
  /** Every card in the chat was added: back to the editor. */
  done: () => void;
}

export type CardProps<C extends Card> = {
  card: C;
  day: string;
  toast: ReturnType<typeof useToast>;
  /** Saved (with what was saved, for the saved chat) or undone. */
  onLogged: (logged: boolean, saved?: Record<string, unknown>) => void;
  register: (id: string, save: Saver | undefined) => void;
  recipe?: RecipeChat;
};

/** Keep the chat's "Log all" pointed at this card's latest save (with the user's edits) while it is open. */
export function useRegister(id: string, save: Saver | undefined, register: CardProps<Card>['register']) {
  useEffect(() => {
    register(id, save);
  });
  useEffect(() => () => register(id, undefined), [id, register]);
}

/** When a card happened, for the time strip: a moment, or a span (sleep, activity); undefined for untimed cards. */
export function cardSpan(c: Card, fallback: number): { start: number; end: number } | undefined {
  switch (c.kind) {
    case 'meal':
      return at(c.proposal.time ?? fallback);
    case 'note':
      return at(c.note.time ?? fallback);
    case 'water':
      return at(c.water.time ?? fallback);
    case 'ketone':
      return at(c.ketone.time ?? fallback);
    case 'portion':
      return at(c.portion.time ?? fallback);
    case 'sleep':
      return { start: c.sleep.start, end: Math.max(c.sleep.start, c.sleep.end) };
    case 'activity':
      return { start: c.activity.start, end: c.activity.start + c.activity.minutes * 60_000 };
    default:
      return undefined;
  }
}
const at = (time: number) => ({ start: time, end: time });

/** The time strip's range: the first to the last card, padded so blocks never sit on the edge. */
export function stripRange(spans: ReadonlyArray<{ start: number; end: number }>): { from: number; to: number } | undefined {
  if (spans.length === 0) return undefined;
  const from = Math.min(...spans.map((s) => s.start));
  const to = Math.max(...spans.map((s) => s.end));
  // At least an hour wide; a tenth of the range on each side.
  const pad = Math.max(30 * 60_000, (to - from) / 10);
  return { from: from - pad, to: to + pad };
}
