import type { proteinEn } from './protein.en';

/** German of protein.en.ts (protein quality on the protein and amino acid pages). */
export const proteinDe: Record<keyof typeof proteinEn, string> = {
  'pq.title': 'Proteinqualität',
  'pq.grid': 'Die 9 unentbehrlichen Aminosäuren · Anteil am Bedarf',
  'pq.gridCell': '{name}: {pct} des Bedarfs',
  'pq.lowest': 'Zuletzt am niedrigsten: {name}, {pct} des Bedarfs',
  'pq.noData': 'In dem, was du eingetragen hast, gibt es noch keine Aminosäurewerte.',

  'pq.row.short': 'Kurz gesagt: worauf es ankommt',
  'pq.row.digest': 'Wie viel der Darm aufnimmt',
  'pq.row.scores': 'Qualitätswerte: PDCAAS und DIAAS',
  'pq.row.mix': 'Pflanzliche Proteine kombinieren',
  'pq.row.leucine': 'Leucin und Muskelaufbau',
  'pq.sources': 'Quellen',

  'pq.info.what':
    'Protein besteht aus 20 Aminosäuren. Die meisten bildet der Körper selbst, 9 aber müssen aus dem Essen kommen: die unentbehrlichen Aminosäuren. Wie viel ein Protein von jeder mitbringt, entscheidet, wie gut der Körper es nutzen kann.',
  'pq.info.tiles':
    'Jede Kachel zeigt den Durchschnitt dieser Aminosäure der letzten Tage, verglichen mit dem WHO-Bedarf für Erwachsene pro kg Körpergewicht, wie auf ihrer eigenen Seite; das Zeichen zeigt ihren Status. Tippe auf eine, um sie zu öffnen.',
  'pq.info.pairs': 'Methionin und Cystein zählen zusammen, ebenso Phenylalanin und Tyrosin: Der Körper bildet jeweils die zweite aus der ersten.',
  'pq.info.data': 'Viele Aminosäurewerte im BLS sind aus typischen Mustern berechnet statt gemessen, daher ist eine einzelne Aminosäure unsicherer als das Protein insgesamt.',

  'pq.short.enough': 'Zuerst zählt, insgesamt genug Protein zu essen. Ein besseres Protein gleicht zu wenig nicht aus.',
  'pq.short.animal': 'Eier, Milch, Fleisch und Fisch bringen alle neun unentbehrlichen Aminosäuren in guter Menge, und der Darm nimmt {low}–{high}% ihres Proteins auf.',
  'pq.short.plant':
    'Pflanzliches Protein wird etwas weniger aufgenommen ({low}–{high}% bei Bohnen, Erbsen und Vollkorn), und jeder Art fehlt vor allem eine Aminosäure: Getreide Lysin, Hülsenfrüchten Methionin.',
  'pq.short.mix': 'Getreide und Hülsenfrüchte gleichen sich aus, und das nicht nur in derselben Mahlzeit: Eine Mischung über den Tag reicht.',
  'pq.short.soy': 'Soja braucht keinen Partner: Im Tofu liegt selbst die niedrigste Aminosäure bei {pct} dessen, was der Körper pro Gramm Protein braucht.',
  'pq.short.muscle':
    'Für Muskelaufbau verteile das Protein über den Tag: etwa {g} g pro Mahlzeit für dich, alle {hMin} bis {hMax} Stunden. Für die Gesundheit allgemein geht es in der Empfehlung um die Menge am Tag.',

  'pq.digest.lead': 'Nicht alles gegessene Protein kommt im Blut an. Von Eiern, Milch, Fleisch und Fisch nimmt der Darm {aLow}–{aHigh}% auf, von Bohnen, Erbsen und Vollkorn {pLow}–{pHigh}%.',
  'pq.digest.table': 'Aufgenommen, gemessen beim Menschen',
  'pq.digest.colFood': 'Lebensmittel',
  'pq.digest.colPct': 'Aufgenommen',
  'pq.digest.why':
    'Pflanzen geben weniger her, weil ihr Protein in ballaststoffreichen Zellwänden steckt und sie Stoffe enthalten, die die Verdauung bremsen. Phytat in Getreide und Hülsenfrüchten senkt sie um bis zu {phytate}%. Gerbstoffe und die Trypsin-Hemmer in Soja und Bohnen senken sie stärker, wo viel davon drin ist (bis zu {tannins} und {trypsin}% in Tierstudien).',
  'pq.digest.cooking': 'Erhitzen und Keimen verändern das Protein und wie viel davon aufgenommen wird. Sehr starkes Erhitzen in manchen verarbeiteten Lebensmitteln kann Lysin so binden, dass der Körper es nicht nutzen kann.',
  'pq.digest.tofoo': 'ToFoo zählt Protein so, wie es gegessen wurde, und vergleicht es mit der Empfehlung, wie sie ist; was nicht aufgenommen wird, zieht es nicht ab.',

  'pq.dig.egg': 'Ei',
  'pq.dig.wheatRefined': 'Weißes Weizenmehl',
  'pq.dig.milk': 'Milch, Käse',
  'pq.dig.soyIsolate': 'Sojaproteinisolat',
  'pq.dig.peanutButter': 'Erdnussbutter',
  'pq.dig.meatFish': 'Fleisch, Fisch',
  'pq.dig.peas': 'Erbsen, getrocknet',
  'pq.dig.rice': 'Reis, weiß',
  'pq.dig.oatmeal': 'Haferflocken',
  'pq.dig.wheatWhole': 'Vollkornweizen',
  'pq.dig.soyFlour': 'Sojamehl',
  'pq.dig.maize': 'Mais',
  'pq.dig.beans': 'Bohnen, getrocknet',

  'pq.scores.lead': 'Ein Qualitätswert fragt zwei Dinge: Bringt ein Protein pro Gramm jede unentbehrliche Aminosäure in der Menge, die der Körper braucht, und wie viel davon wird aufgenommen?',
  'pq.scores.pdcaas':
    'PDCAAS (FAO/WHO, seit 1991): die Aminosäure, die pro Gramm Protein am knappsten ist, als Anteil am Bedarf, mal dem aufgenommenen Anteil. Er endet bei 1,0, daher erreichen Ei, Milch und Sojaisolat alle 1,0.',
  'pq.scores.table': 'Berechnet aus BLS und WHO',
  'pq.scores.colLowest': 'Am knappsten',
  'pq.scores.colPdcaas': 'PDCAAS',
  'pq.scores.note': 'Am knappsten = die Aminosäure mit dem geringsten Gehalt pro Gramm Protein, verglichen mit dem WHO-Muster 2007 für Erwachsene; aufgenommen = die passendste Zeile der Tabelle unter „Wie viel der Darm aufnimmt“.',
  'pq.scores.diaas':
    'DIAAS (FAO, 2013) ist der neuere Wert: Er nutzt, wie viel jeder einzelnen Aminosäure bis zum Ende des Dünndarms aufgenommen wird, und ist nicht gedeckelt, sodass sich zeigt, wenn ein Protein andere ergänzen kann. Die FAO wertet {excellent} oder mehr als ausgezeichnet, {good} bis {goodTop} als gut und unter {good} als zu niedrig für eine Protein-Werbeaussage.',
  'pq.scores.diaasExamples': 'Die Beispiele der FAO für Erwachsene: Vollmilchpulver {milk}; {wheat} g Weizen mit {peas} g Erbsen und {milkPowder} g Milchpulver {mix}, mit Lysin am knappsten.',
  'pq.scores.diaasWhy': 'Die Verdauungsdaten, die der DIAAS braucht, gibt es nur für wenige Lebensmittel, daher kann ToFoo ihn für deine nicht berechnen.',
  'pq.scores.adjust': 'Wofür die WHO einen solchen Wert nutzt: Bei einer Ernährung mit einem Wert unter 1 ist der Proteinbedarf die Empfehlung geteilt durch den Wert.',

  'pq.mix.lead': 'Getreide fehlt es an Lysin, Hülsenfrüchten an Methionin und Cystein. Zusammen gegessen füllt jedes die Lücke des anderen.',
  'pq.mix.example': 'Berechnet aus dem BLS',
  'pq.mix.part': '{grams} g {food}',
  'pq.mix.together': 'Beides zusammen',
  'pq.mix.lowestOf': 'am knappsten {name}',
  'pq.mix.note': 'Anteil = die knappste Aminosäure pro Gramm Protein, verglichen mit dem WHO-Muster 2007 für Erwachsene.',
  'pq.mix.when': 'Sie müssen nicht in derselben Mahlzeit sein: Eine vernünftige Mischung über den Tag reicht. In einer Mahlzeit zu kombinieren, zählt vor allem, wenn insgesamt wenig Protein gegessen wird.',
  'pq.mix.digestion': 'Kombinieren gleicht die Aminosäuren aus, nicht die Verdauung: Bohnen und Vollkorn werden trotzdem etwas weniger aufgenommen als Eier oder Milch.',
  'pq.mix.pairs': 'Klassische Paare: Linsen mit Reis, Erbsensuppe mit Brot, Reis mit Bohnen, Couscous mit Kichererbsen.',
  'pq.mix.kinds': 'Nach Art des Lebensmittels',

  'pq.leu.lead': 'Leucin ist ein Baustein und zugleich ein Signal: Nach einer Mahlzeit hilft es, den Aufbau von Muskelprotein anzuschalten.',
  'pq.leu.meal':
    'Für Menschen, die trainieren, empfiehlt die Sporternährungsgesellschaft ISSN {gMin}–{gMax} g Protein pro Mahlzeit (etwa {gPerKg} g pro kg: {mine} g für dich), mit {leuMin}–{leuMax} g Leucin, alle {hMin} bis {hMax} Stunden.',
  'pq.leu.threshold': 'Etwa {g} g Leucin in einer Mahlzeit wurden als die Menge vorgeschlagen, bei der der Muskelaufbau am stärksten ist.',
  'pq.leu.table': 'Leucin nach Art des Lebensmittels (BLS)',
  'pq.leu.colKind': 'Protein aus',
  'pq.leu.colPer100': 'Leucin pro 100 g Protein',
  'pq.leu.colFor': 'Protein für {g} g Leucin',
  'pq.leu.plant': 'Pflanzliches Protein hat nur etwas weniger Leucin als tierisches: im Mittel {plant} gegenüber {animal} g pro 100 g Protein in einer Übersicht über USDA-Daten. Mais ist ungewöhnlich reich daran.',
  'pq.leu.health': 'Diese Mengen betreffen den Muskelaufbau. Die Empfehlung der DGE für die Gesundheit bezieht sich auf die Menge am Tag.',
};
