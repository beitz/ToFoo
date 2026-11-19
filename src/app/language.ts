import { language, resolveLanguage, setLanguage, type Language } from '../i18n';
import type { Settings } from '../storage/types';

const KEY = 'tofoo.language';

/** The phone's preferred languages, most preferred first. */
function preferred(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

/**
 * Before the database is open: the language last used on this phone (kept in localStorage only so
 * the loading screen doesn't flash the other language), else English.
 */
export function startLanguage(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Private mode or blocked storage: English until the settings load.
  }
  setLanguage(saved === 'de' ? 'de' : 'en');
}

/** Switch to the language the settings ask for; returns it. Cheap when nothing changed. */
export function applyLanguage(setting: Settings['language']): Language {
  const lang = resolveLanguage(setting, preferred());
  if (lang !== language()) setLanguage(lang);
  if (typeof document !== 'undefined' && document.documentElement.lang !== lang) document.documentElement.lang = lang;
  try {
    if (localStorage.getItem(KEY) !== lang) localStorage.setItem(KEY, lang);
  } catch {
    // Not essential: only the loading screen's language.
  }
  return lang;
}

/** What "Automatic" means on this phone, for the setting's label. */
export function phoneLanguage(): Language {
  return resolveLanguage('auto', preferred());
}
