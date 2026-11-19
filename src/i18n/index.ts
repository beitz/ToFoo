import { en, type MessageKey } from './en';
import { de } from './de';
import { setLocale } from '../lib/locale';
import { applyNames } from './names';

export type { MessageKey };

/** The UI languages. English is the default and the fallback for any string a language lacks. */
export const LANGUAGES = ['en', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];

const languages: Record<Language, Partial<Record<MessageKey, string>>> = { en, de };
let currentLang: Language = 'en';
let current: Partial<Record<MessageKey, string>> = en;

export function setLanguage(lang: string): void {
  currentLang = (LANGUAGES as readonly string[]).includes(lang) ? (lang as Language) : 'en';
  current = languages[currentLang];
  applyNames(currentLang);
  setLocale(currentLang === 'de' ? 'de-DE' : 'en-GB', { today: t('day.today'), yesterday: t('day.yesterday') });
}

/** The UI language now in use. */
export function language(): Language {
  return currentLang;
}

/**
 * The language to show for the setting: "auto" follows the phone (German for any German locale,
 * English for everything else); unset is an install from before the setting, which stays English.
 */
export function resolveLanguage(setting: 'auto' | Language | undefined, preferred: readonly string[]): Language {
  if (setting === 'en' || setting === 'de') return setting;
  if (setting === undefined) return 'en';
  const first = preferred[0]?.toLowerCase() ?? '';
  return first === 'de' || first.startsWith('de-') ? 'de' : 'en';
}

/** Translate a key; `{name}` placeholders are replaced from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = current[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
