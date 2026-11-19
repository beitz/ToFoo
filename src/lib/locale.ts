/**
 * The UI language's locale for dates and numbers (weekday and month names, decimal comma in German).
 * Kept here, free of the string tables, so pure helpers in src/lib and src/logic can format without
 * importing i18n; `setLanguage` in src/i18n sets it. English is the default, so tests read English.
 */
export type Locale = 'en-GB' | 'de-DE';

let current: Locale = 'en-GB';
let words = { today: 'Today', yesterday: 'Yesterday' };

export function setLocale(locale: Locale, dayWords?: { today: string; yesterday: string }): void {
  current = locale;
  if (dayWords) words = dayWords;
}

/** The locale to pass to toLocaleString / toLocaleDateString. */
export function locale(): Locale {
  return current;
}

/** "Today" / "Yesterday" in the UI language. */
export function dayWord(which: 'today' | 'yesterday'): string {
  return words[which];
}
