import { useEffect } from 'react';
import type { useToast } from '../../app/toast';
import type { RecipeSoFar, ShownActivity, ShownBatch, ShownIngredients, ShownNote, ShownPortion, ShownProposal, ShownRecipe, ShownSleep, ShownWater } from '../../ai/assistant';
import type { ProposedItem } from '../../ai/tools';
import { t } from '../../i18n';
import { formatTime } from '../../lib/dates';
import { activityName } from '../activity/ActivityForm';
import { spanText } from '../sleep/format';
import { waterText } from '../water/format';

/**
 * A proposed meal (M1, …), journal entry (J1, …), sleep (S1, …), activity (A1, …), water (W1, …),
 * recipe ingredients (R1, …, recipe editor), recipe for the book (R1, …, main chat), serving from
 * stock (P1, …) or cooked batch (B1, …), and whether the user logged, saved or added it.
 */
export type Card =
  | { kind: 'meal'; proposal: ShownProposal; logged: boolean }
  | { kind: 'note'; note: ShownNote; logged: boolean }
  | { kind: 'sleep'; sleep: ShownSleep; logged: boolean }
  | { kind: 'activity'; activity: ShownActivity; logged: boolean }
  | { kind: 'water'; water: ShownWater; logged: boolean }
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
    case 'ingredients':
      return c.ingredients.name || t('ai.ingredientsTitle');
    case 'recipe':
      return c.recipe.name;
    case 'portion':
      return c.portion.name;
    case 'batch':
      return t('ai.batchTitle', { name: c.batch.name });
  }
}

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
