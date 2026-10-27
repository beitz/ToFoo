/**
 * What the user has at home, as the assistant is told when they tick Kitchen under Include my data
 * (owner's ask, 2026-10-27: everything selectable, Kitchen as one box with a box per place, to
 * leave out the spices). Only the ticked places go. Pure, tested in kitchen.test.ts.
 */
import { HOME_PLACES, type HomePlace } from '../storage/types';

/** One thing at home, as the note lists it. */
export interface KitchenThing {
  name: string;
  place: HomePlace;
  /** How much is left as shown ("2 left", "350 g", "1 l"); '' when there is no amount. */
  left: string;
  status?: 'low' | 'out';
  /** The food it is: its key and current name ("BLS:C133000 Oat flakes"); missing for spices and things not linked. */
  food?: string;
}

const STATUS_TEXT = { low: ' (running low)', out: ' (used up)' } as const;

/** The app's note on the message the user first includes their kitchen with. */
export function kitchenNote(places: readonly HomePlace[], things: readonly KitchenThing[]): string {
  const ticked = HOME_PLACES.filter((p) => places.includes(p));
  const left = HOME_PLACES.filter((p) => !places.includes(p));
  const head = `The user included what they have at home, in these places: ${ticked.join(', ')}${left.length ? ` (not ${left.join(', ')}: draw no conclusions about those)` : ''}.`;
  const shown = things.filter((t) => ticked.includes(t.place)).sort((a, b) => HOME_PLACES.indexOf(a.place) - HOME_PLACES.indexOf(b.place) || a.name.localeCompare(b.name));
  if (!shown.length) return `${head} There is nothing there.`;
  return `${head} ${shown.length} things, one line each: place | name | amount left | the food it is (search results mark these [at home]). Amounts go down as the user logs or cooks with them.\n${shown
    .map((t) => `${t.place} | ${t.name} | ${t.left || 'have it'}${t.status ? STATUS_TEXT[t.status] : ''} | ${t.food ?? 'no food linked'}`)
    .join('\n')}\n`;
}
