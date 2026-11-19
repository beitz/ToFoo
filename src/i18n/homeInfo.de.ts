import type { homeInfoEn } from './homeInfo.en';

/** German of homeInfo.en.ts (labels under the ⓘ texts of Home's cards; source titles stay as published). */
export const homeInfoDe: Record<keyof typeof homeInfoEn, string> = {
  'home.sources': 'Quellen',
  'home.src.dailyNeed': 'Tagesbedarf',
  'home.src.ree': 'Ruheenergie, für die Schätzung aus deinem Profil',
  'home.src.week': 'Referenzwerte müssen nicht an jedem einzelnen Tag erreicht werden; im Durchschnitt einer Woche reicht',
  'home.src.store': 'Speichergröße: {list}',
  'home.src.more': 'Die Seite jedes Nährstoffs zeigt, wie seine Zahl berechnet wird, mit Quellen.',
};
