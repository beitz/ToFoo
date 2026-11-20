import type { nutrientInfoEn } from './nutrientInfo.en';

/** German of nutrientInfo.en.ts: what each nutrient does, too little, too much. */
export const nutrientInfoDe: Record<keyof typeof nutrientInfoEn, string> = {
  'info.ENERCC.role': 'Energie aus dem Essen treibt alles an, was der Körper tut, vom Atmen über das Warmhalten bis zur Bewegung.',
  'info.ENERCC.low': 'Mit der Zeit: Gewichtsverlust, Müdigkeit, Muskelabbau und weniger Platz für die anderen Nährstoffe, die du brauchst.',
  'info.ENERCC.high': 'Mit der Zeit: Gewichtszunahme, die das Risiko für Typ-2-Diabetes, Herzkrankheiten und andere Erkrankungen erhöht.',

  'info.PROT625.role': 'Protein liefert die Aminosäuren für Muskeln, Organe, Enzyme, Hormone und Antikörper, die ständig neu aufgebaut werden.',
  'info.PROT625.low': 'Verlust von Muskeln und Kraft, langsamere Heilung, schwächere Abwehr.',
  'info.PROT625.high': 'Mengen bis etwa zum Doppelten des Referenzwerts gelten für gesunde Erwachsene als sicher; viel mehr bringt keinen zusätzlichen Nutzen.',

  'info.EAA.role': 'Eine essenzielle Aminosäure: ein Proteinbaustein, den der Körper nicht selbst bilden kann, daher muss sie aus dem Essen kommen. Tierische Lebensmittel und Soja bringen alle in guter Menge; bei anderen pflanzlichen Lebensmitteln schafft das eine Mischung verschiedener Arten über den Tag.',
  'info.EAA.low': 'Fehlt eine davon, begrenzt das, wie viel Protein der Körper aufbauen kann, auch wenn das Gesamtprotein reicht.',
  'info.EAA.high': 'Aus dem Essen sind keine Probleme bekannt; sehr hohe Dosen aus isolierten Ergänzungsmitteln werden nicht empfohlen.',

  'info.FAT.role': 'Fett ist eine dichte Energiequelle, transportiert die fettlöslichen Vitamine A, D, E und K und liefert essenzielle Fettsäuren.',
  'info.FAT.low': 'Sehr wenig Fett erschwert die Aufnahme der Vitamine A, D, E und K und genug essenzielle Fettsäuren zu bekommen.',
  'info.FAT.high': 'Ein hoher Energieanteil aus Fett macht es leicht, mehr Energie als nötig zu essen; die Art des Fetts zählt mehr als die Menge.',

  'info.FASAT.role': 'Gesättigte Fettsäuren (vor allem in Butter, fettem Fleisch, Käse, Kokos- und Palmfett) sind eine Energiequelle, aber nicht essenziell.',
  'info.FASAT.low': 'Kein Minimum nötig: der Körper bildet sie selbst.',
  'info.FASAT.high': 'Erhöht das LDL-Cholesterin und damit das Risiko für Herzkrankheiten; sie durch ungesättigte Fette zu ersetzen hilft.',

  'info.F18:2CN6.role': 'Linolsäure, die wichtigste Omega-6-Fettsäure, ist essenziell: gebraucht für Zellmembranen und Haut und als Ausgangsstoff für Signalmoleküle.',
  'info.F18:2CN6.low': 'Mangel ist selten: trockene, schuppige Haut und schlechte Wundheilung.',
  'info.F18:2CN6.high': 'Häufig in Pflanzenölen; bei üblichen Mengen kein Schaden bekannt.',

  'info.F18:3CN3.role': 'Alpha-Linolensäure (ALA) ist die essenzielle pflanzliche Omega-3-Fettsäure (Leinsamen, Rapsöl, Walnüsse). Der Körper wandelt einen kleinen Teil davon in EPA und DHA um.',
  'info.F18:3CN3.low': 'Mangel ist selten: Hautprobleme und, theoretisch, weniger EPA und DHA.',
  'info.F18:3CN3.high': 'Aus dem Essen kein Schaden bekannt.',

  'info.EPADHA.role': 'EPA und DHA sind langkettige Omega-3-Fettsäuren, vor allem aus fettem Fisch und Algen. DHA ist Teil von Gehirn und Netzhaut; beide unterstützen die Herzgesundheit.',
  'info.EPADHA.low': 'Eine niedrige Zufuhr hängt mit einem höheren Risiko für Herzkrankheiten zusammen. Der Körper bildet aus ALA nur kleine Mengen.',
  'info.EPADHA.high': 'Aus dem Essen kein Schaden bekannt; hoch dosierte Ergänzungsmittel können das Blut verdünnen.',

  'info.CHO.role': 'Kohlenhydrate (Stärke und Zucker) sind der Hauptbrennstoff für das Gehirn und für harte Muskelarbeit.',
  'info.CHO.low': 'Sehr niedrige Mengen lassen den Körper Fett und Protein zur Energie abbauen; möglich sind Müdigkeit und weniger Ausdauer.',
  'info.CHO.high': 'Meist eine Frage der Art: Vollkorn, Hülsenfrüchte und Obst sind besser als Zucker und raffinierte Stärke.',

  'info.SUGAR.role': 'Zucker kommt natürlich in Obst und Milch vor und wird vielen Lebensmitteln zugesetzt. Er ist schnelle Energie, nicht essenziell.',
  'info.SUGAR.low': 'Kein Minimum nötig.',
  'info.SUGAR.high': 'Viel zugesetzter (freier) Zucker hängt mit Karies und Gewichtszunahme zusammen.',

  'info.FIBT.role': 'Ballaststoffe (aus Vollkorn, Hülsenfrüchten, Gemüse, Obst, Nüssen) halten die Verdauung regelmäßig, füttern Darmbakterien und sättigen länger.',
  'info.FIBT.low': 'Verstopfung; hängt mit einem höheren Risiko für Darmkrebs, Herzkrankheiten und Typ-2-Diabetes zusammen.',
  'info.FIBT.high': 'Eine plötzliche Steigerung kann Blähungen machen; steigere langsam und trink genug.',

  'info.VITAA.role': 'Vitamin A hält das Sehen bei schwachem Licht in Gang und unterstützt Haut, Schleimhäute und Immunsystem. Es kommt als Retinol in tierischen Lebensmitteln und als Beta-Carotin in orangem und grünem Gemüse vor.',
  'info.VITAA.low': 'Nachtblindheit, trockene Augen, mehr Infekte.',
  'info.VITAA.high': 'Große Mengen vorgeformtes Vitamin A (Leber, Ergänzungsmittel) können Leber und Knochen schaden und sind in der Schwangerschaft gefährlich. Beta-Carotin aus Pflanzen macht das nicht.',

  'info.VITD.role': 'Vitamin D hilft, Calcium aufzunehmen, und hält Knochen und Muskeln stark. Das meiste wird in der Haut aus Sonnenlicht gebildet; wenige Lebensmittel (fetter Fisch, Eier, manche Pilze) enthalten viel.',
  'info.VITD.low': 'Schwächere Knochen (Osteomalazie, Osteoporose), Muskelschwäche. Im Winter in deutschen Breiten häufig.',
  'info.VITD.high': 'Nur mit hoch dosierten Ergänzungsmitteln möglich: zu viel Calcium im Blut, Nierenschäden. Die Sonne verursacht das nicht.',

  'info.VITE.role': 'Vitamin E ist ein Antioxidans, das Fette in Zellmembranen vor Schäden schützt. Es steckt in Pflanzenölen, Nüssen und Samen.',
  'info.VITE.low': 'Mangel ist selten (meist bei gestörter Fettaufnahme): Nerven- und Muskelprobleme.',
  'info.VITE.high': 'Aus dem Essen kein Schaden; sehr hohe Dosen aus Ergänzungsmitteln können Blutungen verstärken.',

  'info.VITK.role': 'Vitamin K wird für die Blutgerinnung und für Proteine im Knochen gebraucht. Es steckt in grünem Blattgemüse und manchen fermentierten Lebensmitteln.',
  'info.VITK.low': 'Blutungen und leicht blaue Flecken; Mangel ist bei Erwachsenen selten.',
  'info.VITK.high': 'Aus dem Essen kein Schaden bekannt. Wichtig bei Blutverdünnern wie Marcumar oder Warfarin: halte die Zufuhr gleichmäßig und frag deine Ärztin oder deinen Arzt.',

  'info.THIA.role': 'Vitamin B1 (Thiamin) hilft, Kohlenhydrate in Energie umzuwandeln, und hält Nerven und Herz in Gang. Es steckt in Vollkorn, Schweinefleisch, Hülsenfrüchten.',
  'info.THIA.low': 'Müdigkeit, Reizbarkeit, Nervenprobleme; schwerer Mangel (Beriberi) betrifft Herz und Nerven. Viel Alkohol erhöht das Risiko.',
  'info.THIA.high': 'Kein Schaden bekannt; Überschuss wird mit dem Urin ausgeschieden.',

  'info.RIBF.role': 'Vitamin B2 (Riboflavin) ist Teil der Enzyme, die Energie aus dem Essen freisetzen, und hilft, andere B-Vitamine zu recyceln. Es steckt in Milch, Eiern, Fleisch, Vollkorn.',
  'info.RIBF.low': 'Eingerissene Mundwinkel, wunde Zunge, Hautprobleme.',
  'info.RIBF.high': 'Kein Schaden bekannt; Überschuss wird mit dem Urin ausgeschieden.',

  'info.NIAEQ.role': 'Niacin (B3) wird in jeder Zelle für den Energiestoffwechsel gebraucht. Der Körper bildet es auch aus der Aminosäure Tryptophan.',
  'info.NIAEQ.low': 'Schwerer Mangel (Pellagra): Hautausschlag bei Sonne, Durchfall, Verwirrtheit. Bei abwechslungsreicher Ernährung selten.',
  'info.NIAEQ.high': 'Aus dem Essen kein Schaden; hoch dosierte Ergänzungsmittel machen Hautrötung (Flush) und können der Leber schaden.',

  'info.PANTAC.role': 'Pantothensäure (B5) ist Teil von Coenzym A, zentral für den Energiestoffwechsel und den Aufbau von Fetten. Sie steckt in fast allen Lebensmitteln.',
  'info.PANTAC.low': 'Mangel ist sehr selten: Kribbeln, brennende Füße, Müdigkeit.',
  'info.PANTAC.high': 'Kein Schaden bekannt.',

  'info.VITB6.role': 'Vitamin B6 wird für den Eiweißstoffwechsel, die Bildung von Botenstoffen im Gehirn und roten Blutkörperchen gebraucht. Es steckt in Fisch, Geflügel, Kartoffeln, Bananen, Vollkorn.',
  'info.VITB6.low': 'Blutarmut, Hautentzündung, Verwirrtheit, schwächere Abwehr.',
  'info.VITB6.high': 'Langfristig hohe Dosen aus Ergänzungsmitteln können Nerven schädigen (Taubheit, Kribbeln). Essen allein tut das nicht.',

  'info.BIOT.role': 'Biotin (B7) hilft Enzymen, die Fette, Kohlenhydrate und Aminosäuren verarbeiten. Es steckt in Eiern, Nüssen, Hülsenfrüchten, Leber.',
  'info.BIOT.low': 'Mangel ist selten: Haarausfall, Hautausschlag, brüchige Nägel. Viel rohes Eiweiß kann Biotin blockieren.',
  'info.BIOT.high': 'Kein Schaden bekannt, aber hoch dosierte Ergänzungsmittel können manche Laborwerte verfälschen (z. B. Schilddrüse, Herz).',

  'info.FOL.role': 'Folat (B9) wird für die Bildung von DNA und neuen Zellen gebraucht, auch roten Blutkörperchen. Sehr wichtig vor und in der frühen Schwangerschaft. Es steckt in Blattgemüse, Hülsenfrüchten, Vollkorn.',
  'info.FOL.low': 'Blutarmut, Müdigkeit; in der Schwangerschaft ein höheres Risiko für Neuralrohrdefekte beim Kind.',
  'info.FOL.high': 'Aus dem Essen kein Schaden. Hohe Dosen synthetischer Folsäure können einen Vitamin-B12-Mangel verdecken.',

  'info.VITB12.role': 'Vitamin B12 hält die Nerven gesund und wird für rote Blutkörperchen und DNA gebraucht. Es steckt fast nur in tierischen Lebensmitteln; Veganer brauchen ein Ergänzungsmittel.',
  'info.VITB12.low': 'Blutarmut, Müdigkeit, Kribbeln und Taubheit, Gedächtnisprobleme. Nervenschäden können bleiben, und Speicher können eine niedrige Zufuhr jahrelang verbergen.',
  'info.VITB12.high': 'Kein Schaden bekannt; die Aufnahme ist begrenzt.',

  'info.VITC.role': 'Vitamin C ist ein Antioxidans, nötig für Kollagen (Haut, Blutgefäße, Wundheilung) und für das Immunsystem. Es hilft auch, Eisen aus pflanzlichen Lebensmitteln aufzunehmen.',
  'info.VITC.low': 'Müdigkeit, Zahnfleischbluten, langsame Wundheilung; schwerer Mangel ist Skorbut.',
  'info.VITC.high': 'Große Dosen aus Ergänzungsmitteln können Durchfall machen; Essen nicht.',

  'info.NA.role': 'Natrium (meist aus Salz) steuert den Flüssigkeitshaushalt und den Blutdruck und wird für Nerven und Muskeln gebraucht.',
  'info.NA.low': 'Selten (starkes Schwitzen, Krankheit): Kopfweh, Übelkeit, Krämpfe.',
  'info.NA.high': 'Erhöht den Blutdruck und damit das Risiko für Schlaganfall und Herzkrankheiten. Das meiste Salz kommt aus Brot, Käse, Wurst und Fertiggerichten.',

  'info.CLD.role': 'Chlorid hält zusammen mit Natrium den Flüssigkeitshaushalt und ist Teil der Magensäure. Es kommt vor allem aus Salz.',
  'info.CLD.low': 'Selten (Erbrechen, starkes Schwitzen).',
  'info.CLD.high': 'Kommt meist mit zu viel Salz; siehe Natrium.',

  'info.K.role': 'Kalium hält Nerven, Muskeln und Herzrhythmus in Gang und hilft, den Blutdruck zu senken. Es steckt in Gemüse, Obst, Kartoffeln, Hülsenfrüchten, Nüssen.',
  'info.K.low': 'Muskelschwäche, Krämpfe, Herzrhythmusstörungen; eine niedrige Zufuhr hängt mit höherem Blutdruck zusammen.',
  'info.K.high': 'Aus dem Essen nur bei Nierenerkrankung oder bestimmten Medikamenten ein Problem; dann frag deine Ärztin oder deinen Arzt.',

  'info.CA.role': 'Calcium baut Knochen und Zähne auf und wird für Muskeln, Nerven und die Blutgerinnung gebraucht. Es steckt in Milchprodukten, calciumreichem Mineralwasser, Grüngemüse, Tofu, Mandeln.',
  'info.CA.low': 'Über Jahre holt sich der Körper Calcium aus den Knochen, was das Osteoporose-Risiko erhöht.',
  'info.CA.high': 'Sehr hohe Mengen, meist aus Ergänzungsmitteln, können Nierensteine und Verstopfung verursachen.',

  'info.MG.role': 'Magnesium ist an Hunderten von Enzymreaktionen beteiligt, bei Energie, Muskeln, Nerven und Knochen. Es steckt in Vollkorn, Nüssen, Samen, Hülsenfrüchten, Grüngemüse.',
  'info.MG.low': 'Muskelkrämpfe, Müdigkeit, Herzrhythmusstörungen.',
  'info.MG.high': 'Aus dem Essen kein Schaden; Ergänzungsmittel in hohen Dosen machen Durchfall.',

  'info.P.role': 'Phosphor baut mit Calcium Knochen und Zähne auf und ist Teil der DNA und des Energieträgers ATP. Er steckt in fast allen eiweißreichen Lebensmitteln.',
  'info.P.low': 'Selten: Schwäche, Knochenschmerzen.',
  'info.P.high': 'Vor allem bei Nierenerkrankung ein Thema; Phosphatzusätze in verarbeiteten Lebensmitteln bringen viel dazu.',

  'info.FE.role': 'Eisen transportiert Sauerstoff im Blut (Hämoglobin) und in den Muskeln. Es steckt in Fleisch, Hülsenfrüchten, Vollkorn, Grüngemüse; Eisen aus Pflanzen wird schlechter aufgenommen, besser mit Vitamin C, schlechter mit Tee und Kaffee.',
  'info.FE.low': 'Eisenmangelanämie mit Müdigkeit, blasser Haut, Kurzatmigkeit, Frieren. Häufig bei Frauen mit Periode.',
  'info.FE.high': 'Aus dem Essen begrenzt der Körper die Aufnahme. Ergänzungsmittel können den Magen reizen; hohe Dosen sind gefährlich, besonders für Kinder.',

  'info.ZN.role': 'Zink wird für das Immunsystem, die Wundheilung, Wachstum, Geschmack und Geruch und viele Enzyme gebraucht. Es steckt in Fleisch, Meeresfrüchten, Käse, Vollkorn, Hülsenfrüchten, Samen.',
  'info.ZN.low': 'Mehr Infekte, langsame Wundheilung, Haarausfall, Geschmacksverlust. Phytat in Vollkorn und Hülsenfrüchten senkt die Aufnahme.',
  'info.ZN.high': 'Hohe Dosen aus Ergänzungsmitteln senken über die Zeit das Kupfer und können die Abwehr schwächen.',

  'info.ID.role': 'Jod wird für Schilddrüsenhormone gebraucht, die den Stoffwechsel steuern, und für die Gehirnentwicklung des ungeborenen Kindes. Hauptquellen in Deutschland: Jodsalz, Fisch, Milchprodukte.',
  'info.ID.low': 'Vergrößerte Schilddrüse (Kropf), Schilddrüsenunterfunktion mit Müdigkeit und Gewichtszunahme; in der Schwangerschaft Schaden für die Entwicklung des Kindes.',
  'info.ID.high': 'Große Mengen (Algen, Ergänzungsmittel) können die Schilddrüse ebenfalls stören.',

  'info.SE.role': 'Selen ist Teil von Enzymen, die Zellen vor Schäden schützen und Schilddrüsenhormone wirken lassen; es hilft auch dem Immunsystem. Es steckt in Fisch, Meeresfrüchten, Fleisch, Innereien und Eiern; in pflanzlichen Lebensmitteln hängt es vom Boden ab. Paranüsse enthalten sehr viel.',
  'info.SE.low': 'Mangel ist in Europa selten. Eine niedrige Zufuhr kann Abwehr und Schilddrüsenfunktion schwächen. Veganer essen weniger davon.',
  'info.SE.high': 'Zu viel über längere Zeit (aus Ergänzungsmitteln oder vielen Paranüssen) macht brüchige Haare und Nägel, Knoblauchgeruch im Atem, Hautausschlag und Müdigkeit.',

  'info.CU.role': 'Kupfer hilft Enzymen, die Energie, Bindegewebe und rote Blutkörperchen bilden, und hilft, Eisen zu verwerten. Es steckt in Nüssen, Samen, Vollkorn, Hülsenfrüchten, Innereien.',
  'info.CU.low': 'Mangel ist selten: Blutarmut, wenige weiße Blutkörperchen; kann auf sehr hohe Zinkdosen aus Ergänzungsmitteln folgen.',
  'info.CU.high': 'Aus dem Essen kein Schaden; hohe Dosen aus Ergänzungsmitteln können der Leber schaden.',

  'info.MN.role': 'Mangan ist Teil von Enzymen für Knochenbildung, Stoffwechsel und antioxidativen Schutz. Es steckt in Vollkorn, Nüssen, Hülsenfrüchten, Tee.',
  'info.MN.low': 'Mangel ist beim Menschen sehr selten.',
  'info.MN.high': 'Aus dem Essen kein Schaden bekannt; hohe Belastung (meist eingeatmet bei der Arbeit oder verunreinigtes Wasser) kann die Nerven beeinträchtigen.',

  'info.FD.role': 'Fluorid stärkt den Zahnschmelz und schützt vor Karies. Quellen: Fluoridsalz, Zahnpasta, Tee, manche Mineralwässer.',
  'info.FD.low': 'Mehr Karies.',
  'info.FD.high': 'In der Kindheit macht es weiße Flecken auf den Zähnen (Fluorose); sehr hohe Mengen über Jahre betreffen die Knochen.',

  'info.CR.role': 'Chrom soll Insulin beim Wirken helfen. Ob es überhaupt essenziell ist, ist umstritten.',
  'info.CR.low': 'Bei normaler Ernährung ist kein klarer Mangel bekannt.',
  'info.CR.high': 'Aus dem Essen kein Schaden bekannt.',

  'info.MO.role': 'Molybdän ist Teil von Enzymen, die bestimmte Aminosäuren und Giftstoffe abbauen. Es steckt in Hülsenfrüchten, Getreide, Nüssen.',
  'info.MO.low': 'Bei normaler Ernährung ist kein Mangel bekannt.',
  'info.MO.high': 'Aus dem Essen kein Schaden bekannt; sehr hohe Mengen können Kupfer stören.',
};
