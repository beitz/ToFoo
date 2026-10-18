import type { FeatureKey } from '../storage/types';

export interface FeatureInfo {
  key: FeatureKey;
  label: string;
  description: string;
  default: boolean;
  /** Not built yet: shown disabled in settings. */
  comingIn?: string;
}

/** All optional features. A new optional feature gets an entry here and so a toggle in Settings. */
export const FEATURES: FeatureInfo[] = [
  { key: 'uncertaintyRanges', label: 'Uncertainty ranges', description: 'Show ranges, or only the central value.', default: true },
  { key: 'absorption', label: 'Absorption modelling', description: 'Off: typical absorption for everything (raw intake vs. recommendation).', default: true },
  { key: 'retention', label: 'Cooking and storage losses', description: 'Off: no losses from cooking, fridge or freezer.', default: true },
  { key: 'sunVitaminD', label: 'Vitamin D from sun', description: 'Add the estimated vitamin D your skin makes.', default: true },
  { key: 'fillUnloggedDays', label: 'Fill in unlogged days', description: 'Assume you ate as usual on days you did not log, shown as a wider range. Off: a day without entries counts as nothing eaten. Any single day can be set otherwise in the diary.', default: false },
  { key: 'advancedNumbers', label: 'Advanced numbers', description: 'Show units, parameter values and sources inline.', default: false },
  { key: 'yesterdayNudge', label: 'Ask about yesterday', description: 'A gentle note when yesterday has no status.', default: true },
  { key: 'backupReminder', label: 'Backup reminder', description: 'A note when your last backup is older than the set number of days.', default: true },
  { key: 'aiAssistant', label: 'AI assistant', description: 'Log meals by chatting: photos and text, sent to Anthropic with your own API key. Set it up under Settings → AI assistant.', default: false },
  { key: 'openFoodFacts', label: 'Open Food Facts lookup', description: 'Log packaged products by scanning or typing the barcode. Each lookup sends only the barcode to Open Food Facts; products you looked up stay on this phone.', default: false },
  { key: 'productWebSearch', label: 'Find products by name', description: 'With the AI assistant and the Open Food Facts lookup on: when a photo shows a package but no readable barcode, the assistant finds the product on openfoodfacts.org with Anthropic\'s web search, using the brand and name on the package. About 1 cent per search plus tokens, billed to your API key.', default: true },
  { key: 'voiceInput', label: 'Voice input', description: 'A microphone button in the assistant chat: what you say is turned into text by OpenAI with your own OpenAI API key, and lands in the chat box for you to check. Set it up under Settings → AI assistant.', default: false },
  { key: 'journal', label: 'Journal', description: 'Write anything at any time ("tired all afternoon", "headache since noon"), in the diary or with the pen button on Home. Entries stay on this phone and are in your backups.', default: true },
  { key: 'sleep', label: 'Sleep', description: 'When you fell asleep and woke up: a bed button on Home in the evening, a question on Home in the morning, the "Sleep or wake up" shortcut, the diary, or tell the assistant. Stays on this phone and is in your backups.', default: false },
  { key: 'activity', label: 'Activity', description: 'What you did, when, how long and roughly how hard, in the diary or by telling the assistant. Time outside counts toward the vitamin D sun estimate. Stays on this phone and is in your backups.', default: false },
  { key: 'water', label: 'Water', description: 'How much water you get from drinks and food each day, against the DGE guide value: plain water with one tap on Home or by telling the assistant; the water in foods and other drinks is counted from the BLS. Stays on this phone and is in your backups.', default: false },
  { key: 'insights', label: 'Insights', description: 'With the AI assistant on: "Look for patterns" in the diary and the journal compares your journal with food, sleep, activity and water over a period, or answers a question like "why am I tired on Mondays?". The assistant picks what to compare; the app counts every number. Sends your journal entries and the day summaries the assistant asks for to Anthropic, with your own API key, only when you ask.', default: false },
  { key: 'usda', label: 'USDA FoodData Central', description: 'Search the US food database by name for foods the BLS lacks, with full vitamin and mineral data for generic foods. Each search sends only the search words to the USDA; foods you log stay on this phone.', default: false },
  { key: 'forecasts', label: 'Forecasts', description: '"Runs low in ~6 weeks" on gauges.', default: true, comingIn: 'v2' },
  { key: 'bestNextBatch', label: '"Best next batch" suggestion', description: 'Rank your recipes by the gaps they fill.', default: true, comingIn: 'v2' },
  { key: 'notifications', label: 'Notifications', description: 'Reminders on your phone.', default: false, comingIn: 'later' },
];

export const DEFAULT_FEATURES = Object.fromEntries(FEATURES.map((f) => [f.key, f.default])) as Record<FeatureKey, boolean>;

export function isOn(features: Partial<Record<FeatureKey, boolean>> | undefined, key: FeatureKey): boolean {
  const info = FEATURES.find((f) => f.key === key);
  if (info?.comingIn) return false;
  return features?.[key] ?? info?.default ?? false;
}
