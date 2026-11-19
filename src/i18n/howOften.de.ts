import type { howOftenEn } from './howOften.en';

/** German of howOften.en.ts. The food rules follow the DGE wording. */
export const howOftenDe: Record<keyof typeof howOftenEn, string> = {
  'often.title': 'Wie oft',
  'often.spoken': 'Wie oft: {rule}',
  'often.source': 'Deutsche Gesellschaft für Ernährung (DGE), lebensmittelbezogene Empfehlungen für gesunde Erwachsene',
  'often.examples': 'Was 100 g decken, gemessen an deiner Referenzzufuhr von {ref} am Tag:',
  'often.example': 'etwa {n} Tage',
  'often.exampleSpoken': '100 g {food} decken etwa {n} Tage',
  'often.examplesSource': 'Mengen aus BLS 4.0, roher Fisch.',
  'often.dgeOnly': 'Die Empfehlungen sagen nur für manche Lebensmittel, wie oft; Nährstoffe, die sie nicht nennen, haben keine Zeile.',

  'often.EPADHA': 'Fetter Fisch ein- bis zweimal pro Woche',
  'often.ID': 'Seefisch ein- bis zweimal pro Woche, Milchprodukte täglich',
  'often.CA': 'Milch und Milchprodukte täglich',
  'often.RIBF': 'Milch und Milchprodukte täglich',
  'often.VITB12': 'Milch und Milchprodukte täglich',
  'often.PROT625': 'Milchprodukte täglich, Hülsenfrüchte mindestens einmal pro Woche',
  'often.FIBT': 'Obst und Gemüse fünfmal am Tag, Hülsenfrüchte einmal pro Woche',
  'often.F18:2CN6': 'Eine kleine Handvoll Nüsse täglich',
  'often.F18:3CN3': 'Eine kleine Handvoll Nüsse täglich',

  'window.slow': 'Gemittelt über {weeks} Wochen statt {usual} Tage, weil der Körper es langsam ausgleicht.',
  'window.EPADHA': 'Rote Blutkörperchen tauschen die Hälfte ihres Omega-3 in etwa 4 Wochen aus, daher zählt eine Fischmahlzeit wochenlang.',
  'window.F18:2CN6': 'Körperfett hält eine große Reserve, die sich über Jahre ändert; das Blut folgt innerhalb von Wochen.',
  'window.F18:3CN3': 'Körperfett hält eine Reserve, die die Zufuhr von Jahren widerspiegelt; das Blut folgt innerhalb von Wochen.',
  'window.VITE': 'Körperfett hält eine große Reserve, die sich über Jahre ändert; das Blut folgt innerhalb von Wochen.',
  'window.SE': 'Der Körper hält Selen aus dem Essen monatelang: die Hälfte einer markierten Dosis war nach 7 bis 10 Monaten noch da.',
  'window.VITC': 'Gemittelt über {days} Tage: der Körper hält einen Vorrat an Vitamin C, der Wochen reicht; die Hälfte wird alle 10 bis 16 Tage ersetzt.',
  'window.ZN': 'Gemittelt über {days} Tage: der Körper hat keinen Zinkspeicher, aber einen kleinen Vorrat in Blut und Organen, der sich in etwa 12 Tagen erneuert.',
  'window.VITK': 'Gemittelt über {days} Tage: die Leber hält wenig Vitamin K und verbraucht es innerhalb von Tagen.',
  'window.sourceLink': 'Quelle',
  'window.chartSpan': 'Die Balken zeigen die letzten {n} Tage; der Durchschnitt umfasst {days} Tage.',
};
