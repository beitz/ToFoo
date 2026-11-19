import type { effectsEn } from './effects.en';

/** German of effects.en.ts: what a nutrient's current level can mean. */
export const effectsDe: Record<keyof typeof effectsEn, string> = {
  'effect.ENERCC.low': 'Über Wochen: Gewichtsverlust, Müdigkeit und Muskelabbau.',
  'effect.ENERCC.lowMore': 'Zu wenig essen lässt auch weniger Platz für Protein, Vitamine und Mineralstoffe, die du brauchst.',
  'effect.ENERCC.lowHelp': 'Wenn du nicht abnehmen willst, nimm eine Mahlzeit oder einen Snack dazu, oder energiereichere Lebensmittel: Nüsse, Öle, Vollkornbrot, Milchprodukte.',

  'effect.PROT625.low': 'Mit der Zeit: Verlust von Muskeln und Kraft, langsamere Heilung, schwächere Abwehr.',
  'effect.PROT625.lowHelp': 'Nimm zu jeder Mahlzeit ein Eiweißlebensmittel: Hülsenfrüchte, Milchprodukte, Eier, Fisch, Fleisch, Tofu. Pflanzliche Proteine werden gemischt vollständiger, etwa Getreide mit Hülsenfrüchten.',

  'effect.EAA.low': 'Begrenzt, wie viel Protein dein Körper aufbauen kann, auch wenn das Gesamtprotein reicht.',
  'effect.EAA.lowHelp': 'Insgesamt mehr Protein, oder Quellen mischen: Getreide hat wenig Lysin und Hülsenfrüchte wenig Methionin, beides zusammen füllt die Lücke des anderen. Tierische Lebensmittel und Soja haben alle.',

  'effect.F18:2CN6.low': 'Selten ein echtes Problem; ein langer Mangel zeigt sich als trockene, schuppige Haut und schlechte Wundheilung.',
  'effect.F18:2CN6.lowHelp': 'Pflanzenöle (Sonnenblume, Raps, Soja), Nüsse und Samen.',

  'effect.F18:3CN3.low': 'Weniger pflanzliches Omega-3, aus dem der Körper auch etwas EPA und DHA bildet.',
  'effect.F18:3CN3.lowHelp': 'Raps- oder Leinöl zum Kochen und für Salate, Walnüsse, geschroteter Leinsamen.',

  'effect.EPADHA.low': 'Eine niedrige Zufuhr hängt mit einem höheren Risiko für Herzkrankheiten zusammen.',
  'effect.EPADHA.lowMore': 'Der Körper bildet aus pflanzlichem Omega-3 nur kleine Mengen, daher ist das Essen die Hauptquelle.',
  'effect.EPADHA.lowSize1': 'Studien mit über 100.000 Menschen: zusätzliches EPA und DHA änderte die Todesfälle insgesamt kaum oder gar nicht. Es senkt vielleicht leicht die Todesfälle durch Herzkrankheiten: etwa {people} Menschen mussten es nehmen, damit einer verschont blieb.',
  'effect.EPADHA.lowHelp': 'Fetter Fisch wie Hering, Makrele oder Lachs ein- bis zweimal pro Woche; Algenöl ist die pflanzliche Quelle.',

  'effect.FIBT.low': 'Hängt mit Verstopfung und einem höheren Risiko für Herzkrankheiten, Typ-2-Diabetes und Darmkrebs zusammen.',
  'effect.FIBT.lowSize1': 'Langzeitstudien: wer die meisten Ballaststoffe aß, hatte {lowerRange} weniger Todesfälle, Herzkrankheiten, Schlaganfälle, Typ-2-Diabetes und Darmkrebs als wer am wenigsten aß; der Nutzen war bei etwa {from}–{to} g am Tag am größten.',
  'effect.FIBT.lowHelp': 'Vollkornbrot, -nudeln und -reis statt weißer; Hülsenfrüchte ein paarmal pro Woche; Gemüse, Obst und Nüsse jeden Tag. Steigere Schritt für Schritt und trink genug.',

  'effect.VITAA.low': 'Ein langer Mangel: schlechtes Sehen bei schwachem Licht, trockene Augen, mehr Infekte.',
  'effect.VITAA.lowHelp': 'Oranges und dunkelgrünes Gemüse (Karotten, Süßkartoffel, Spinat, Grünkohl) mit etwas Fett, dazu Milchprodukte und Eier. Leber ist sehr reich: eine kleine Portion reicht weit.',

  'effect.VITD.low': 'Mit der Zeit: schwächere Knochen und Muskeln. Im Winter in deutschen Breiten häufig.',
  'effect.VITD.lowMore': 'Das meiste Vitamin D bildet die Haut aus Sonnenlicht, daher füllt Essen allein diesen Speicher selten. Nur ein Bluttest zeigt deinen echten Wert.',
  'effect.VITD.lowHelp': 'Von Frühling bis Herbst Zeit draußen um die Mittagszeit mit unbedeckten Armen und Gesicht. Fetter Fisch und Eier geben etwas. Zeigt ein Bluttest einen niedrigen Wert, ist ein Ergänzungsmittel der übliche Weg, ihn zu füllen; frag deine Ärztin oder deinen Arzt.',

  'effect.VITE.low': 'Ein echter Mangel ist selten und kommt meist mit gestörter Fettaufnahme: Nerven- und Muskelprobleme.',
  'effect.VITE.lowHelp': 'Pflanzenöle (Weizenkeim, Sonnenblume, Raps), Nüsse und Samen.',

  'effect.VITK.low': 'Mangel ist bei Erwachsenen selten: Blutungen und leicht blaue Flecken.',
  'effect.VITK.lowHelp': 'Grünes Blattgemüse (Spinat, Grünkohl, Brokkoli, Salat) und Kräuter. Wenn du Blutverdünner nimmst, ändere die Menge nur mit deiner Ärztin oder deinem Arzt.',

  'effect.THIA.low': 'Müdigkeit, Reizbarkeit, Nervenprobleme; viel Alkohol erhöht das Risiko.',
  'effect.THIA.lowHelp': 'Vollkorn, Haferflocken, Hülsenfrüchte, Schweinefleisch, Sonnenblumenkerne. Viel davon geht ins Kochwasser, also dämpfe oder nutze das Wasser.',

  'effect.RIBF.low': 'Eingerissene Mundwinkel, wunde Zunge, Hautprobleme.',
  'effect.RIBF.lowHelp': 'Milch und Milchprodukte, Eier, Fleisch, Fisch, Vollkorn, Pilze, Mandeln.',

  'effect.NIAEQ.low': 'Bei abwechslungsreicher Ernährung selten; ein schwerer Mangel bringt Hautausschlag bei Sonne, Durchfall und Verwirrtheit.',
  'effect.NIAEQ.lowHelp': 'Fleisch, Fisch, Erdnüsse, Vollkorn, Hülsenfrüchte. Protein hilft auch: der Körper bildet Niacin aus Tryptophan.',

  'effect.PANTAC.low': 'Ein Mangel ist sehr selten: Kribbeln, brennende Füße, Müdigkeit.',
  'effect.PANTAC.lowHelp': 'Sie steckt in fast allen Lebensmitteln; Vollkorn, Hülsenfrüchte, Eier, Fleisch, Pilze und Avocado haben am meisten.',

  'effect.VITB6.low': 'Blutarmut, Hautentzündung, Verwirrtheit, schwächere Abwehr.',
  'effect.VITB6.lowHelp': 'Fisch, Geflügel, Kartoffeln, Hülsenfrüchte, Bananen, Nüsse, Vollkorn.',

  'effect.BIOT.low': 'Ein Mangel ist selten: Haarausfall, Hautausschlag, brüchige Nägel.',
  'effect.BIOT.lowHelp': 'Eier (gekocht: rohes Eiweiß blockiert Biotin), Nüsse, Haferflocken, Hülsenfrüchte, Pilze.',

  'effect.FOL.low': 'Blutarmut und Müdigkeit; vor und in der frühen Schwangerschaft ein höheres Risiko für Fehlbildungen.',
  'effect.FOL.lowHelp': 'Blattgemüse, Hülsenfrüchte, Brokkoli, Vollkorn, Orangen. Hitze und Lagerung zerstören Folat, also iss manches roh oder kurz gegart. Frauen, die schwanger werden könnten, brauchen zusätzlich Folsäuretabletten.',

  'effect.VITB12.low': 'Blutarmut, Müdigkeit, Kribbeln und Gedächtnisprobleme; Nervenschäden können bleiben.',
  'effect.VITB12.lowMore': 'Der Speicher reicht Jahre, daher kann eine niedrige Zufuhr lange verborgen bleiben. Ein Bluttest zeigt, wo du wirklich stehst.',
  'effect.VITB12.lowHelp': 'Nur tierische Lebensmittel (Fleisch, Fisch, Eier, Milchprodukte) enthalten nützliche Mengen; Veganer brauchen ein Ergänzungsmittel.',

  'effect.VITC.low': 'Müdigkeit, Zahnfleischbluten, langsame Wundheilung; Skorbut, wenn schwer.',
  'effect.VITC.lowSize1': 'Skorbut tritt nach etwa {months} Monaten ganz ohne Vitamin C auf, und Behandlung heilt ihn in etwa {days} Tagen. Dauerhaft niedrige Werte unterhalb von Skorbut erhöhen vielleicht das Risiko für Herzkrankheiten, Krebs und grauen Star; das ist weniger sicher.',
  'effect.VITC.lowHelp': 'Paprika, Zitrusfrüchte, Beeren, Kiwi, Brokkoli, Kohl, Kartoffeln. Hitze und Lagerung zerstören es, daher zählen frisch und roh am meisten.',

  'effect.NA.low': 'Meist kein echter Mangel: Salz beim Kochen oder am Tisch zählt nur, wenn du es einträgst.',
  'effect.NA.lowMore': 'Ein echter Mangel kommt mit starkem Schwitzen, Erbrechen oder Krankheit: Kopfweh, Übelkeit, Krämpfe.',
  'effect.NA.lowHelp': 'Trag das Salz ein, das du dazugibst, oder lies diese Zeile als Lücke im Protokoll statt in deiner Ernährung.',

  'effect.CLD.low': 'Meist kein echter Mangel: Chlorid kommt mit Salz, das nur zählt, wenn du es einträgst.',
  'effect.CLD.lowHelp': 'Trag das Salz ein, das du dazugibst, oder lies diese Zeile als Lücke im Protokoll statt in deiner Ernährung.',

  'effect.K.low': 'Hängt mit höherem Blutdruck zusammen; ein echter Mangel macht Muskelschwäche und Krämpfe.',
  'effect.K.lowSize1': 'Langzeitstudien: wer mehr Kalium aß, hatte {fewer} weniger Schlaganfälle (wahrscheinlich {fewerRange}). In Studien senkte mehr Kalium den Blutdruck bei Menschen mit Bluthochdruck um etwa {mmHg} mmHg.',
  'effect.K.lowHelp': 'Gemüse, Obst, Kartoffeln, Hülsenfrüchte, Nüsse. Ein Teil geht ins Kochwasser.',

  'effect.CA.low': 'Über Jahre holt sich der Körper Calcium aus den Knochen, was das Osteoporose-Risiko erhöht.',
  'effect.CA.lowSize1': 'In {none} von {studies} Langzeitstudien hing die Calciummenge aus dem Essen nicht mit Knochenbrüchen zusammen. Das sagt nicht, was ein schwerer Mangel über viele Jahre bewirkt.',
  'effect.CA.lowHelp': 'Milch, Joghurt, Käse; calciumreiches Mineralwasser; Grünkohl, Brokkoli, mit Calcium hergestellter Tofu, Mandeln.',

  'effect.MG.low': 'Muskelkrämpfe, Müdigkeit, Herzrhythmusstörungen.',
  'effect.MG.lowHelp': 'Vollkorn, Nüsse, Samen, Hülsenfrüchte, grünes Gemüse; manche Mineralwässer haben viel.',

  'effect.P.low': 'Selten: Schwäche und Knochenschmerzen.',
  'effect.P.lowHelp': 'Er steckt in fast allen eiweißreichen Lebensmitteln: Milchprodukte, Fleisch, Fisch, Hülsenfrüchte, Vollkorn.',

  'effect.FE.low': 'Eisenmangelanämie: Müdigkeit, blasse Haut, Kurzatmigkeit, Frieren.',
  'effect.FE.lowMore': 'Der Speicher reicht Monate, daher bewegt er sich langsam; ein Ferritin-Bluttest zeigt, wo er wirklich steht.',
  'effect.FE.lowHelp': 'Fleisch, Hülsenfrüchte, Vollkorn, Samen, Grüngemüse. Vitamin C in derselben Mahlzeit hilft, Eisen aus Pflanzen aufzunehmen; Kaffee und Tee zur Mahlzeit senken es.',

  'effect.ZN.low': 'Mehr Infekte, langsame Wundheilung, Haarausfall, Geschmacksverlust.',
  'effect.ZN.lowHelp': 'Fleisch, Meeresfrüchte, Käse, Vollkorn, Hülsenfrüchte, Samen, Nüsse. Einweichen, Keimen und Sauerteig senken das Phytat, das Zink blockiert.',

  'effect.ID.low': 'Vergrößerte Schilddrüse oder Unterfunktion, mit Müdigkeit und Gewichtszunahme.',
  'effect.ID.lowMore': 'Jodsalz ist in Deutschland die Hauptquelle, und Salz, das du dazugibst, zählt nur, wenn du es einträgst.',
  'effect.ID.lowHelp': 'Nimm zu Hause Jodsalz, iss ein- bis zweimal pro Woche Seefisch, und Milchprodukte.',
  'effect.SE.low': 'Schwächerer Schutz vor Zellschäden und Infekten; Schilddrüsenhormone wirken schlechter.',
  'effect.SE.lowMore': 'Der BLS hat kein Selen, daher schätzt ToFoo es aus der britischen Lebensmitteltabelle (CoFID): nimm es als grob.',
  'effect.SE.lowHelp': 'Fisch, Meeresfrüchte, Eier, Fleisch und Innereien; Linsen und Pilze. Eine Paranuss bringt viel (die DGE rät zu höchstens zwei am Tag).',

  'effect.CU.low': 'Selten: Blutarmut und wenige weiße Blutkörperchen; kann auf hohe Zinkdosen aus Ergänzungsmitteln folgen.',
  'effect.CU.lowHelp': 'Nüsse, Samen, Vollkorn, Hülsenfrüchte, Kakao.',

  'effect.FD.low': 'Mehr Karies.',
  'effect.FD.lowMore': 'Zahnpasta zählt hier nicht mit, und sie ist der wichtigste Schutz.',
  'effect.FD.lowHelp': 'Fluoridzahnpasta; Fluoridsalz und manche Mineralwässer kommen dazu.',

  'effect.FASAT.high': 'Erhöht das LDL-Cholesterin und damit das Risiko für Herzkrankheiten.',
  'effect.FASAT.highMore': 'Der Nutzen kommt davon, sie durch ungesättigte Fette (Pflanzenöle, Nüsse, Fisch) oder Vollkorn zu ersetzen, nicht durch Zucker oder Weißmehl.',
  'effect.FASAT.highSize1': 'Studien über zwei Jahre oder länger: wer weniger gesättigte Fettsäuren aß, hatte {fewer} weniger Herz-Kreislauf-Ereignisse wie Herzinfarkte und Schlaganfälle (wahrscheinlich {fewerRange}). Etwa {people} Menschen mussten sie {years} Jahre lang senken, damit einem von ihnen eines erspart blieb; die Todesfälle insgesamt änderten sich nicht klar.',
  'effect.FASAT.highHelp': 'Raps- oder Olivenöl statt Butter, Schmalz oder Kokosfett; magereres Fleisch und weniger Wurst, Käse und Sahne; Nüsse statt Gebäck und Schokolade.',

  'effect.VITAA.high': 'Mit der Zeit kann vorgeformtes Vitamin A Leber und Knochen schaden, und einem ungeborenen Kind.',
  'effect.VITAA.highHelp': 'Es kommt aus Leber, Leberwurst, Lebertran und Ergänzungsmitteln. Beta-Carotin aus Gemüse zählt hier nicht.',

  'effect.VITD.high': 'Mit der Zeit: zu viel Calcium im Blut und Nierenschäden.',
  'effect.VITD.highHelp': 'Das kommt aus Ergänzungsmitteln oder angereicherten Lebensmitteln, nie von der Sonne. Prüf die Dosis mit deiner Ärztin oder deinem Arzt.',

  'effect.VITE.high': 'Kann das Blutungsrisiko erhöhen.',
  'effect.VITE.highHelp': 'Meist aus Ergänzungsmitteln; prüf die Dosis.',

  'effect.VITB6.high': 'Langfristig hohe Dosen können Nerven schädigen: Taubheit und Kribbeln.',
  'effect.VITB6.highHelp': 'Meist aus Ergänzungsmitteln oder angereicherten Getränken; prüf die Dosis.',

  'effect.FOL.high': 'Synthetische Folsäure in hohen Dosen kann einen Vitamin-B12-Mangel verdecken.',
  'effect.FOL.highHelp': 'Sie kommt aus Ergänzungsmitteln und angereicherten Lebensmitteln; Folat aus normalem Essen zählt hier nicht.',

  'effect.NA.high': 'Erhöht den Blutdruck und damit das Risiko für Schlaganfall und Herzkrankheiten.',
  'effect.NA.highSize1': 'Studien, die Menschen {fromYears} bis {toYears} Jahre begleiteten: wer mehr Salz aß, hatte {more} mehr Schlaganfälle (wahrscheinlich {moreRange}).',
  'effect.NA.highSize2': 'Studien: etwa {less} g weniger Salz am Tag senkte den Blutdruck innerhalb von Wochen um etwa {mmHg} mmHg (wahrscheinlich {mmHgRange}), mehr bei Menschen mit Bluthochdruck.',
  'effect.NA.highHelp': 'Das meiste Salz kommt aus Brot, Käse, Wurst, Fertiggerichten und Snacks. Würz mit Kräutern und Gewürzen, salz am Tisch weniger, wähl salzärmere Varianten.',

  'effect.CA.high': 'Nierensteine und Verstopfung sind möglich.',
  'effect.CA.highHelp': 'Meist aus Ergänzungsmitteln zusätzlich zu Milchprodukten; prüf die Dosis.',

  'effect.MG.high': 'Magnesium aus Ergänzungsmitteln macht in hohen Dosen Durchfall.',
  'effect.MG.highHelp': 'Senk die Dosis des Ergänzungsmittels; Magnesium aus normalem Essen zählt hier nicht.',

  'effect.FE.high': 'Magenbeschwerden, und mit der Zeit zu viel Eisen im Körper.',
  'effect.FE.highHelp': 'Meist aus Ergänzungsmitteln; nimm sie nur nach einem Ferritintest und mit deiner Ärztin oder deinem Arzt.',

  'effect.ZN.high': 'Senkt mit der Zeit das Kupfer und kann die Abwehr schwächen.',
  'effect.ZN.highHelp': 'Meist aus Ergänzungsmitteln; prüf die Dosis.',

  'effect.ID.high': 'Kann die Schilddrüse stören.',
  'effect.ID.highHelp': 'Meist aus Algen oder Ergänzungsmitteln; getrocknete Algen können sehr viel enthalten.',
  'effect.SE.high': 'Mit der Zeit brüchige Haare und Nägel, Knoblauchatem, Hautausschlag und Müdigkeit.',
  'effect.SE.highHelp': 'Meist aus Ergänzungsmitteln oder vielen Paranüssen; prüf die Dosis.',

  'effect.CU.high': 'Hohe Dosen können mit der Zeit der Leber schaden.',
  'effect.CU.highHelp': 'Meist aus Ergänzungsmitteln; prüf die Dosis.',

  'effect.FD.high': 'Sehr hohe Mengen über Jahre betreffen die Knochen.',
  'effect.FD.highHelp': 'Schwarzer Tee und manche Mineralwässer können viel enthalten; Fluoridsalz bringt mehr dazu.',

  'effect.MO.high': 'Sehr hohe Mengen können Kupfer in die Quere kommen.',
  'effect.MO.highHelp': 'Meist aus Ergänzungsmitteln; prüf die Dosis.',
};
