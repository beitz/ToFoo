import type { MessageKey } from '../../i18n';
import { isOn } from '../../settings/features';
import type { FeatureKey, Settings } from '../../storage/types';

/**
 * Guided tours (docs/SPEC.md "First launch and guided tours"): one short line per part of a screen.
 * Tours are data only: each step names a `data-tour` marker on the screen and a text key. A step whose
 * marker isn't on screen (feature off, card hidden) is skipped. Lines say what a part is, never how
 * it looks (owner's ask), so a restyle doesn't make them wrong.
 */
export type TourId = 'home' | 'insights' | 'kitchen' | 'fan' | 'settings' | 'assistant' | 'nutrient' | 'weight';

export interface TourStep {
  /** The `data-tour` marker to outline; none = a bubble in the middle of the screen. */
  target?: string;
  text: MessageKey;
  /** Offer "Set up your profile" while age, sex and weight are all unset. */
  profileButton?: boolean;
}

export interface Tour {
  steps: TourStep[];
  /** Show the screen with the built-in sample week while the tour runs (a new user has nothing logged). */
  sample?: boolean;
  /** Only once this feature is on (the assistant's screen says nothing useful before). */
  requires?: FeatureKey;
}

export const TOURS: Record<TourId, Tour> = {
  home: {
    sample: true,
    steps: [
      { text: 'tour.home.start' },
      { target: 'tabs', text: 'tour.home.tabs' },
      { target: 'home.days', text: 'tour.home.days' },
      { target: 'home.today', text: 'tour.home.today' },
      { target: 'home.week', text: 'tour.home.week' },
      { target: 'home.stores', text: 'tour.home.stores' },
      { target: 'home.info', text: 'tour.home.info' },
      { target: 'home.next', text: 'tour.home.next' },
      { target: 'home.chips', text: 'tour.home.chips' },
      { target: 'settings-button', text: 'tour.home.settings', profileButton: true },
      { target: 'round-button', text: 'tour.home.round' },
    ],
  },
  insights: {
    sample: true,
    steps: [
      { target: 'insights.tabs', text: 'tour.insights.tabs' },
      { target: 'insights.summary', text: 'tour.insights.summary' },
      { target: 'insights.trackers', text: 'tour.insights.trackers' },
      { target: 'insights.levels', text: 'tour.insights.levels' },
      { target: 'insights.patterns', text: 'tour.insights.patterns' },
      { target: 'insights.days', text: 'tour.insights.days' },
    ],
  },
  kitchen: {
    steps: [
      { target: 'kitchen.tiles', text: 'tour.kitchen.tiles' },
      { target: 'kitchen.shopping', text: 'tour.kitchen.shopping' },
      { target: 'kitchen.add', text: 'tour.kitchen.add' },
      { target: 'kitchen.recipes', text: 'tour.kitchen.recipes' },
    ],
  },
  fan: {
    steps: [
      { target: 'fan.journal', text: 'tour.fan.journal' },
      { target: 'fan.activity', text: 'tour.fan.activity' },
      { target: 'fan.sleep', text: 'tour.fan.sleep' },
      { target: 'fan.fast', text: 'tour.fan.fast' },
      { target: 'fan.assistant', text: 'tour.fan.assistant' },
      { target: 'round-button', text: 'tour.fan.log' },
    ],
  },
  settings: {
    steps: [
      { target: 'settings.profile', text: 'tour.settings.profile' },
      { target: 'settings.features', text: 'tour.settings.features' },
      { target: 'settings.backup', text: 'tour.settings.backup' },
      { target: 'settings.tours', text: 'tour.settings.tours' },
    ],
  },
  assistant: {
    requires: 'aiAssistant',
    steps: [
      { target: 'assistant.input', text: 'tour.assistant.input' },
      { text: 'tour.assistant.cards' },
      { text: 'tour.assistant.numbers' },
    ],
  },
  nutrient: {
    steps: [
      { target: 'nutrient.hero', text: 'tour.nutrient.hero' },
      { target: 'nutrient.trust', text: 'tour.nutrient.trust' },
      { target: 'nutrient.sources', text: 'tour.nutrient.sources' },
      { target: 'nutrient.fills', text: 'tour.nutrient.fills' },
      { target: 'nutrient.why', text: 'tour.nutrient.why' },
    ],
  },
  weight: {
    requires: 'weight',
    steps: [
      { target: 'weight.trend', text: 'tour.weight.trend' },
      { target: 'weight.check', text: 'tour.weight.check' },
    ],
  },
};

export const TOUR_IDS = Object.keys(TOURS) as TourId[];

/** The longest a tour line may be, so it stays one or two lines on a phone. */
export const MAX_TOUR_LINE = 100;

/** The tour that belongs to a screen, shown the first time it is opened. The round button's tour is started by the button. */
export function tourForRoute(route: readonly string[]): TourId | undefined {
  const [a, b, c] = route;
  if (!a) return 'home';
  if (a === 'overview') return 'insights';
  if (a === 'kitchen') return 'kitchen';
  if (a === 'settings' && !b) return 'settings';
  if (a === 'assistant' && b !== 'chat') return 'assistant';
  // The nutrient page itself, not its food list, Why page or a split over a recipe or meal.
  if (a === 'nutrient' && b && !c) return 'nutrient';
  if (a === 'weight') return 'weight';
  return undefined;
}

/** Tours already shown. An install from before the tours has no list: it counts as having seen them all (owner's decision). */
export function toursSeen(settings: Pick<Settings, 'toursSeen'>): ReadonlySet<string> {
  return new Set(settings.toursSeen ?? TOUR_IDS);
}

/** The tour to run now, if any: never before the first-launch sheets are done, and each tour once. */
export function pendingTour(
  route: readonly string[],
  settings: Pick<Settings, 'toursSeen' | 'features'>,
  onboarded: boolean,
  fanOpen: boolean,
  doneThisSession: ReadonlySet<string>,
): TourId | undefined {
  if (!onboarded) return undefined;
  const seen = toursSeen(settings);
  const fresh = (id: TourId | undefined) => {
    if (!id || doneThisSession.has(id) || seen.has(id)) return undefined;
    const needs = TOURS[id].requires;
    return needs && !isOn(settings.features, needs) ? undefined : id;
  };
  return (fanOpen ? fresh('fan') : undefined) ?? fresh(tourForRoute(route));
}
