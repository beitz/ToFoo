/**
 * German UI strings (Deutsch), with the same keys as en.ts. Informal "du", as most German apps; food
 * and nutrient words as the DGE uses them. A key missing here shows the English text.
 */
import type { MessageKey } from './en';

export const de: Partial<Record<MessageKey, string>> = {
  'settings.language': 'Sprache',
  'settings.languageAuto': 'Automatisch',
  'settings.languageAutoIs': 'Automatisch folgt deinem Handy: jetzt {lang}.',
  'language.en': 'English',
  'language.de': 'Deutsch',
  'day.today': 'Heute',
  'day.yesterday': 'Gestern',
};
