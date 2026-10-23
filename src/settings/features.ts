import type { FeatureKey } from '../storage/types';

/** The sections of the features list in Settings (owner's ask, 2026-10-23: one long list was hard to scan), in order. */
export const FEATURE_GROUPS = ['track', 'kitchen', 'sources', 'assistant', 'reminders', 'numbers', 'later'] as const;
export type FeatureGroup = (typeof FEATURE_GROUPS)[number];

export interface FeatureInfo {
  key: FeatureKey;
  group: FeatureGroup;
  /** Only does something while this one is on: shown indented under it, and greyed out while it is off. */
  requires?: FeatureKey;
  /**
   * The value for settings saved before this feature existed, when it differs from `default`: a feature
   * that used to be always there stays on for people who had it, and new installs get `default`.
   */
  unsetMeans?: boolean;
  label: string;
  description: string;
  default: boolean;
  /** Not built yet: shown disabled in settings. */
  comingIn?: string;
  /** Switched on its own settings page instead of the general list. */
  page?: 'backup';
}

/** All optional features. A new optional feature gets an entry here and so a toggle in Settings. */
export const FEATURES: FeatureInfo[] = [
  { key: 'uncertaintyRanges', group: 'numbers', label: 'Uncertainty ranges', description: 'Show ranges, or only the central value.', default: true },
  { key: 'absorption', group: 'numbers', label: 'Absorption modelling', description: 'Off: typical absorption for everything (raw intake vs. recommendation).', default: true },
  { key: 'retention', group: 'numbers', label: 'Cooking and storage losses', description: 'Off: no losses from cooking, fridge or freezer.', default: true },
  { key: 'fillUnloggedDays', group: 'numbers', label: 'Fill in unlogged days', description: 'Assume you ate as usual on days you did not log, shown as a wider range. Off: a day without entries counts as nothing eaten. Any single day can be set otherwise in the diary.', default: false },
  { key: 'levelEffects', group: 'numbers', label: 'What your levels mean', description: 'When a nutrient is low or too much, a line at the top of its page says what that can do, opening to what helps, where yours came from and the sources; and one line on Insights sums up all of them.', default: true },
  { key: 'advancedNumbers', group: 'numbers', label: 'Advanced numbers', description: 'Show units, parameter values and sources inline.', default: false },
  { key: 'yesterdayNudge', group: 'reminders', label: 'Ask about yesterday', description: 'A line on Home when yesterday is missing something you track (meals, and sleep, activity or water when they are on), with a page to log it, take your usual, or skip.', default: true },
  { key: 'backupReminder', group: 'reminders', label: 'Backup reminder', description: 'A note on Home when your last saved backup file is older than the set number of days.', default: true },
  { key: 'autoBackup', group: 'reminders', label: 'Automatic backups', description: 'Once a day when you open the app, and before a restore or an app update that changes how data is stored, the app saves a full backup on this phone by itself.', default: true, page: 'backup' },
  { key: 'aiAssistant', group: 'assistant', label: 'AI assistant', description: 'Log meals by chatting: photos and text, sent to Anthropic with your own API key. Set it up under Settings → AI assistant.', default: false },
  { key: 'openFoodFacts', group: 'sources', label: 'Open Food Facts lookup', description: 'Log packaged products by scanning the barcode, or find them by name in a list of German products kept on this phone. Each lookup sends only the barcode to Open Food Facts; products you looked up stay on this phone.', default: false },
  { key: 'productWebSearch', group: 'assistant', requires: 'aiAssistant', label: 'Find products by name', description: 'With the AI assistant and the Open Food Facts lookup on: when a photo shows a package but no readable barcode, the assistant finds the product on openfoodfacts.org with Anthropic\'s web search, using the brand and name on the package. About 1 cent per search plus tokens, billed to your API key.', default: true },
  { key: 'voiceInput', group: 'assistant', requires: 'aiAssistant', label: 'Voice input', description: 'A microphone button in the assistant chat: what you say is turned into text by OpenAI with your own OpenAI API key, and lands in the chat box for you to check. Set it up under Settings → AI assistant.', default: false },
  { key: 'journal', group: 'track', label: 'Journal', description: 'Write anything at any time ("tired all afternoon", "headache since noon"), in the diary or with the pen button on Home. Entries stay on this phone and are in your backups.', default: true },
  { key: 'sleep', group: 'track', label: 'Sleep', description: 'When you fell asleep and woke up: a bed button on Home in the evening, a question on Home in the morning, the "Sleep or wake up" shortcut, the diary, or tell the assistant. Stays on this phone and is in your backups.', default: false },
  { key: 'activity', group: 'track', label: 'Activity', description: 'What you did, when, how long and roughly how hard, in the diary or by telling the assistant. Time outside counts toward the vitamin D sun estimate. Stays on this phone and is in your backups.', default: false },
  { key: 'water', group: 'track', label: 'Water', description: 'How much water you get from drinks and food each day, against the DGE guide value: plain water with one tap on Home or by telling the assistant; the water in foods and other drinks is counted from the BLS. Stays on this phone and is in your backups.', default: false },
  { key: 'sunVitaminD', group: 'track', label: 'Vitamin D from sun', description: 'Estimate the vitamin D your skin makes from time outside: an outdoor routine (Settings → Vitamin D and time outside) plus outside activities and time outside you log, counted into your vitamin D. Off: no sun in the numbers, and no questions about time outside or uncovered skin.', default: false },
  { key: 'shoppingList', group: 'kitchen', label: 'Shopping list', description: 'A list to take shopping, on this phone and usable without internet: add things by hand, add a recipe\'s ingredients for the portions you plan, tick them off in the shop. A button on Home and on every recipe; with the AI assistant on, tell it what to put on the list. In your backups.', default: true },
  { key: 'atHome', group: 'kitchen', label: 'At home', description: 'What you bought and have at home: ready meals, foods, spices, by fridge, freezer, cupboard and spices. Log them with one tap; amounts go down by themselves as you log what you eat or cook. Mark spices as running low and they go on the shopping list; put away what you bought in one go. With the AI assistant on, tell it what you bought. Stays on this phone and is in your backups.', default: true },
  { key: 'weight', group: 'track', label: 'Weight', description: 'Weigh in now and then (once a week is enough): a page with your weight trend, smoothed so water swings don\'t jump around, and a check whether your food log looks complete: with a steady weight you eat about what you burn. A check on the log, not a weight goal. Your newest weight is used for the energy estimate, protein per kg and store sizes either way. Stays on this phone and is in your backups.', default: false },
  { key: 'fasting', group: 'track', label: 'Fasting', description: 'Start a fast with the round button on Home: the app counts the hours, shows a fasting card while it runs, keeps your past fasts on the fasting page and marks the days as fasted. Off: no fasting button or overview row; a fast already running still shows until you end it.', default: false, unsetMeans: true },
  { key: 'ketosis', group: 'track', requires: 'fasting', label: 'Ketosis estimate', description: 'During a fast you started in the app: how far toward ketosis you probably are, from fasting studies, as a curve with a range on the fasting card on Home and the fasting page. Moved by the carbohydrate in your last meal, exercise since, sex and BMI. Information only, not a target. Not meant for people with diabetes treated with insulin or SGLT2 inhibitors, or during pregnancy: their ketone values belong with their doctor.', default: false },
  { key: 'ketoneReadings', group: 'track', requires: 'ketosis', label: 'Ketone readings', description: 'With the ketosis estimate on: enter ketone measurements from a meter during a fast, on the fasting page or by telling the assistant. They show on the curve, and with enough blood readings the estimate learns your own timing. Stays on this phone and is in your backups.', default: false },
  { key: 'insights', group: 'assistant', requires: 'aiAssistant', label: 'Patterns', description: 'With the AI assistant on: "Look for patterns" in the diary and the journal compares your journal with food, sleep, activity and water over a period, or answers a question like "why am I tired on Mondays?". The assistant picks what to compare; the app counts every number. Sends your journal entries and the day summaries the assistant asks for to Anthropic, with your own API key, only when you ask, and only from the period and the kinds of data you tick.', default: false },
  { key: 'forgottenCheck', group: 'assistant', requires: 'aiAssistant', label: 'Ask about forgotten foods', description: 'With the AI assistant on: a meal card asks about what logs most often miss and your message did not mention, such as oil in the pan, a drink or a sauce. Tap what you had, add how much, and send; the assistant updates the card. Nothing is sent until you press Send.', default: true },
  { key: 'questionShortcuts', group: 'assistant', requires: 'aiAssistant', label: 'Question shortcuts', description: 'With the AI assistant on: small questions on some screens ("How am I doing?"). A tap opens the assistant with the question typed in; nothing is sent until you press Send.', default: true },
  { key: 'recipeIdeas', group: 'assistant', requires: 'aiAssistant', label: 'Recipe ideas', description: 'With the AI assistant on: ask it what to cook or how to improve one of your recipes, and it suggests recipes that fit your nutrient gaps, the foods you eat and your cooking preferences, each with a reason line. The app computes every number. Only when you ask, it sends your nutrient status, recipe and recent food names, your excluded foods and your preferences text to Anthropic with your own API key.', default: false },
  { key: 'saveChats', group: 'assistant', requires: 'aiAssistant', label: 'Save assistant chats', description: 'With the AI assistant on: every chat (meals, recipes, Insights) is saved on this phone with what the assistant looked up, proposed and what you logged, so you can export it as a file, for example to report a wrong result. Photos and voice recordings are saved too; photos are left out of the file unless you include them, recordings always. Saved chats are not in backups and stay until you delete them (Settings → AI assistant → Saved chats).', default: true },
  { key: 'usda', group: 'sources', label: 'USDA FoodData Central', description: 'Search the US food database by name for foods the BLS lacks, with full vitamin and mineral data for generic foods. Each search sends only the search words to the USDA; foods you log stay on this phone.', default: false },
  { key: 'forecasts', group: 'later', label: 'Forecasts', description: '"Runs low in ~6 weeks" on gauges.', default: true, comingIn: 'v2' },
  { key: 'bestNextBatch', group: 'later', label: '"Best next batch" suggestion', description: 'Rank your recipes by the gaps they fill.', default: true, comingIn: 'v2' },
  { key: 'notifications', group: 'later', label: 'Notifications', description: 'Reminders on your phone.', default: false, comingIn: 'later' },
];

export const DEFAULT_FEATURES = Object.fromEntries(FEATURES.map((f) => [f.key, f.default])) as Record<FeatureKey, boolean>;

export function isOn(features: Partial<Record<FeatureKey, boolean>> | undefined, key: FeatureKey): boolean {
  const info = FEATURES.find((f) => f.key === key);
  if (info?.comingIn) return false;
  return features?.[key] ?? info?.unsetMeans ?? info?.default ?? false;
}
