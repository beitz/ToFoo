/** English UI strings (default language). Add a language by creating a file with the same keys. */
export const en = {
  'app.name': 'ToFoo',
  'nav.home': 'Home',
  'nav.diary': 'Diary',
  'nav.recipes': 'Recipes',
  'nav.settings': 'Settings',
  'common.loading': 'Loading…',
  'common.back': 'Back',
  'about.title': 'About and data sources',
  'about.intro':
    'ToFoo is a personal nutrition tracker. It estimates how full your body stores are, so you can plan your next dish. It is general education, not medical advice.',
  'about.blsHeading': 'Food data: BLS 4.0',
  'about.blsConverted':
    'The BLS data was converted to a compact format and abridged (only the nutrients the app uses are included).',
  'about.licence': 'Licence',
  'about.privacyHeading': 'Privacy',
  'about.privacy':
    'All your data stays on this device. ToFoo has no accounts, no analytics and makes no requests to third parties.',
  'about.codeHeading': 'Source code',
  'about.code': 'ToFoo is developed at',
  'about.version': 'App version',
  'about.dataVersion': 'Food database',
} as const;

export type MessageKey = keyof typeof en;
