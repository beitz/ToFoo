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
  { key: 'fillUnloggedDays', label: 'Fill in unlogged days', description: 'Assume you ate as usual on days you did not log, shown as a wider range. Off: a day without entries counts as nothing eaten.', default: false },
  { key: 'advancedNumbers', label: 'Advanced numbers', description: 'Show units, parameter values and sources inline.', default: false },
  { key: 'yesterdayNudge', label: 'Ask about yesterday', description: 'A gentle note when yesterday has no status.', default: true },
  { key: 'backupReminder', label: 'Backup reminder', description: 'A note when your last backup is older than the set number of days.', default: true },
  { key: 'aiAssistant', label: 'AI assistant', description: 'Log meals by chatting: photos and text, sent to Anthropic with your own API key. Set it up under Settings → AI assistant.', default: false },
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
