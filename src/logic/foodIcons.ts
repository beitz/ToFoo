/**
 * Icons and short names for things at home (docs/SPEC.md, "At home", "Icons and short names"; owner's
 * idea 2026-11-07: "each item could get a small icon and a short unique name… if I have multiple
 * pizzas one could be named diavola and the other margherita"). Nothing is stored: both are worked
 * out from the name each time, so a better word list improves things already at home too. Pure;
 * tested in foodIcons.test.ts. The pictures are Fluent Emoji Flat (src/ui/foodIconData.ts).
 */
import { normalize } from '../foods/search';

/**
 * Words that pick each icon, English and German as `normalize` writes them (ä → a, ß → ss). A word
 * matches a whole word of the name; a German compound matches by its end ("Vollkornbrot") before its
 * start ("Hähnchenbrustfilet"), for words of four letters or more. Phrases ("ice cream") go first.
 */
const ICON_WORDS = {
  pizza: 'pizza pizzen',
  hamburger: 'burger hamburger cheeseburger',
  'hot-dog': 'hotdog wurst wurstchen bratwurst sausage sausages salami wiener bockwurst frankfurter chorizo mettwurst leberwurst weisswurst cabanossi',
  bacon: 'bacon speck schinken ham prosciutto',
  'cut-of-meat': 'meat fleisch rind rindfleisch beef steak schwein schweinefleisch pork hack hackfleisch mince minced lamm lamb kotelett schnitzel gulasch goulash braten roast',
  'poultry-leg': 'chicken hahnchen huhn poultry geflugel pute puten turkey truthahn ente duck nuggets',
  fish: 'fish fisch lachs salmon thunfisch tuna hering herring forelle trout kabeljau cod seelachs pollock makrele mackerel sardine sardinen sardines matjes fischstabchen sprotten',
  'fried-shrimp': 'shrimp shrimps garnele garnelen prawn prawns krabben scampi',
  egg: 'egg eggs ei eier',
  'cheese-wedge': 'cheese kase gouda emmentaler edamer cheddar mozzarella parmesan feta camembert brie gorgonzola halloumi ricotta mascarpone',
  'glass-of-milk': 'milk milch joghurt jogurt yoghurt yogurt skyr quark kefir sahne cream schmand buttermilch',
  butter: 'butter margarine ghee',
  bread: 'bread brot brotchen toast semmel knackebrot loaf rolls',
  'baguette-bread': 'baguette ciabatta',
  croissant: 'croissant croissants hornchen',
  pretzel: 'brezel brezeln pretzel pretzels laugenbrezel',
  bagel: 'bagel bagels',
  pancakes: 'pancake pancakes pfannkuchen crepes eierkuchen',
  waffle: 'waffel waffeln waffle waffles',
  'sheaf-of-rice': 'hafer haferflocken oats oat flakes oatmeal mehl flour wheat weizenmehl dinkel dinkelmehl getreide gries semolina couscous bulgur hirse millet quinoa',
  'bowl-with-spoon': 'musli muesli granola cornflakes porridge cereal cereals',
  'cooked-rice': 'reis rice basmati jasmin risotto',
  spaghetti: 'spaghetti pasta nudeln noodles penne fusilli tagliatelle makkaroni macaroni tortellini ravioli spatzle gnocchi',
  'steaming-bowl': 'suppe soup bruhe broth ramen',
  'pot-of-food': 'eintopf stew',
  'curry-rice': 'curry',
  'shallow-pan-of-food': 'lasagne lasagna auflauf gratin paella casserole',
  'green-salad': 'salat salad',
  'leafy-green': 'spinat spinach mangold chard kale grunkohl rucola rocket kohl cabbage wirsing lettuce',
  broccoli: 'brokkoli broccoli blumenkohl cauliflower rosenkohl',
  carrot: 'karotte karotten mohre mohren carrot carrots',
  tomato: 'tomate tomaten tomato tomatoes passata',
  'hot-pepper': 'chili chilli chilies peperoni jalapeno jalapenos',
  'bell-pepper': 'paprika',
  cucumber: 'gurke gurken cucumber cucumbers',
  eggplant: 'aubergine aubergines eggplant',
  'ear-of-corn': 'mais corn maiskolben',
  potato: 'kartoffel kartoffeln potato potatoes chips crisps',
  'french-fries': 'pommes fries',
  'roasted-sweet-potato': 'susskartoffel susskartoffeln',
  onion: 'zwiebel zwiebeln onion onions schalotte schalotten shallot shallots lauch leek',
  garlic: 'knoblauch garlic',
  'brown-mushroom': 'pilz pilze champignon champignons mushroom mushrooms',
  avocado: 'avocado avocados',
  olive: 'olive oliven olives olivenol',
  'pouring-liquid': 'ol oil rapsol sonnenblumenol speiseol essig vinegar',
  jar: 'marmelade konfiture jam pesto sauce sosse ketchup mayonnaise mayo senf mustard aufstrich spread nutella',
  'honey-pot': 'honig honey sirup syrup',
  'chocolate-bar': 'schokolade chocolate schoko kakao cocoa zartbitter edelbitter',
  cookie: 'keks kekse cookie cookies biscuit biscuits',
  candy: 'bonbon bonbons candy sweets gummibarchen fruchtgummi lakritz',
  doughnut: 'donut donuts doughnut krapfen berliner',
  shortcake: 'kuchen cake torte',
  cupcake: 'muffin muffins cupcake cupcakes',
  pie: 'pie tarte quiche',
  custard: 'pudding custard',
  'ice-cream': 'eis eiscreme gelato sorbet',
  popcorn: 'popcorn',
  peanuts: 'erdnuss erdnusse peanut peanuts erdnussbutter nuss nusse nuts mandel mandeln almonds walnuss walnusse walnuts haselnuss haselnusse hazelnuts cashew cashews pistazien',
  chestnut: 'marone maronen kastanien chestnut chestnuts',
  beans: 'bohnen bohne beans kidney kichererbsen chickpeas linsen lentils hummus tofu',
  'pea-pod': 'erbsen peas zuckerschoten edamame',
  coconut: 'kokos kokosnuss coconut kokosmilch',
  'red-apple': 'apfel apple apples apfelmus',
  pear: 'birne birnen pear pears',
  banana: 'banane bananen banana bananas',
  grapes: 'trauben weintrauben grapes rosinen raisins',
  strawberry: 'erdbeere erdbeeren strawberry strawberries',
  blueberries: 'heidelbeeren blaubeeren blueberries beeren berries himbeeren raspberries',
  cherries: 'kirsche kirschen cherry cherries',
  peach: 'pfirsich pfirsiche peach peaches nektarine nektarinen aprikose aprikosen apricot apricots',
  lemon: 'zitrone zitronen lemon lemons limette limetten lime limes',
  tangerine: 'orange orangen oranges mandarine mandarinen clementine clementinen tangerine',
  watermelon: 'wassermelone watermelon',
  melon: 'melone melon honigmelone',
  pineapple: 'ananas pineapple',
  mango: 'mango mangos',
  'kiwi-fruit': 'kiwi kiwis',
  'ginger-root': 'ingwer ginger',
  herb: 'krauter herbs basilikum basil petersilie parsley schnittlauch chives oregano thymian thyme rosmarin rosemary majoran marjoram dill minze mint lorbeer lorbeerblatt lorbeerblatter koriander coriander zimt cinnamon kreuzkummel cumin kummel muskat muskatnuss nutmeg kurkuma turmeric vanille vanilla nelken cloves',
  salt: 'salz salt jodsalz meersalz pfeffer pepper gewurz gewurze seasoning spice spices',
  'hot-beverage': 'kaffee coffee espresso cappuccino',
  'teacup-without-handle': 'tee tea matcha',
  'beverage-box': 'saft juice smoothie',
  'cup-with-straw': 'limo limonade cola soda drink',
  droplet: 'wasser water mineralwasser sprudel',
  'beer-mug': 'bier beer pils',
  'wine-glass': 'wein wine rotwein weisswein sekt prosecco',
  'tumbler-glass': 'whisky whiskey rum vodka wodka gin schnaps likor',
  'canned-food': 'dose dosen konserve can canned',
  sushi: 'sushi',
  dumpling: 'maultaschen dumpling dumplings',
  burrito: 'wrap wraps tortilla tortillas burrito',
  'stuffed-flatbread': 'doner kebab',
  falafel: 'falafel',
  sandwich: 'sandwich sandwiches',
} as const;

/** Several words that pick an icon together, checked before single words. */
const ICON_PHRASES: ReadonlyArray<[string, FoodIconName]> = [
  ['ice cream', 'ice-cream'],
  ['peanut butter', 'peanuts'],
  ['olive oil', 'olive'],
  ['sweet potato', 'roasted-sweet-potato'],
  ['bay leaf', 'herb'],
  ['bay leaves', 'herb'],
  ['bell pepper', 'bell-pepper'],
  ['chili con carne', 'pot-of-food'],
  ['chilli con carne', 'pot-of-food'],
  ['creme fraiche', 'glass-of-milk'],
  ['spring onion', 'onion'],
];

export type FoodIconName = keyof typeof ICON_WORDS;

/**
 * The icon for a whole BLS food group (the code's leading letter, data/README.md "Food groups"),
 * for a thing whose name has no word above but whose linked food is known.
 */
const GROUP_ICON: Readonly<Record<string, FoodIconName>> = {
  B: 'bread',
  C: 'sheaf-of-rice',
  D: 'cookie',
  E: 'spaghetti',
  F: 'red-apple',
  G: 'broccoli',
  H: 'beans',
  K: 'potato',
  M: 'glass-of-milk',
  N: 'cup-with-straw',
  P: 'wine-glass',
  Q: 'butter',
  R: 'salt',
  S: 'candy',
  T: 'fish',
  U: 'cut-of-meat',
  V: 'poultry-leg',
  W: 'hot-dog',
  X: 'pot-of-food',
  Y: 'shallow-pan-of-food',
};

/** The BLS eggs (E1…) are eggs, the rest of group E is pasta and dumplings. */
const groupIcon = (code: string): FoodIconName | undefined => (code.startsWith('E1') ? 'egg' : GROUP_ICON[code.charAt(0)]);

/** Every icon the word list or the groups can pick, for bundling just those pictures. */
export const FOOD_ICON_NAMES = Object.keys(ICON_WORDS) as FoodIconName[];

const EXACT = new Map<string, FoodIconName>();
const COMPOUND: Array<[string, FoodIconName]> = [];
for (const [icon, words] of Object.entries(ICON_WORDS) as Array<[FoodIconName, string]>) {
  for (const w of words.split(' ')) {
    if (!EXACT.has(w)) EXACT.set(w, icon);
    if (w.length >= 4) COMPOUND.push([w, icon]);
  }
}
// Longer word parts first, so "erdnussbutter" is peanuts before it is butter.
COMPOUND.sort((a, b) => b[0].length - a[0].length);

/** The name's words, as matched: lower case, no umlauts or accents, no punctuation. */
const wordsOf = (name: string) => normalize(name).split(' ').filter(Boolean);

/**
 * The icon for a thing at home, from its name: a phrase, then the first word that is one of the
 * words above, then the first compound that ends or starts with one; else the BLS group of the food
 * it is linked to (`code`); else none (the tile shows two letters).
 */
export function iconFor(name: string, code?: string): FoodIconName | undefined {
  const text = ` ${wordsOf(name).join(' ')} `;
  for (const [phrase, icon] of ICON_PHRASES) if (text.includes(` ${phrase} `)) return icon;
  const words = wordsOf(name);
  for (const w of words) {
    const icon = EXACT.get(w);
    if (icon) return icon;
  }
  // German compounds: the last part names the thing ("Roggenvollkornbrot", "Milchschokolade").
  for (const w of words) for (const [part, icon] of COMPOUND) if (w.length > part.length && w.endsWith(part)) return icon;
  for (const w of words) for (const [part, icon] of COMPOUND) if (w.length > part.length && w.startsWith(part)) return icon;
  return code ? groupIcon(code) : undefined;
}

/** Two letters for a thing without an icon: "Tante Emmas Paste" → "Ta". */
export function monogram(name: string): string {
  const first = shownWords(name)[0] ?? name.trim();
  const letters = [...first].filter((c) => /\p{L}|\p{N}/u.test(c));
  return letters.slice(0, 2).join('').replace(/^./, (c) => c.toUpperCase()) || '?';
}

/** Words never worth showing on their own. */
const FILLER = new Set(['bio', 'mit', 'und', 'with', 'and', 'of', 'the', 'in', 'von', 'aus', 'a', 'la', 'le', 'de', 'der', 'die', 'das', 'im', 'nach', 'art', 'style', 'raw', 'roh', 'g', 'kg', 'mg', 'ml', 'cl', 'l', 'x', 'st', 'stk', 'stuck', 'pck', 'pack', 'packung', 'er']);

/**
 * The words of a name worth showing: the part before the brand (" · ") and before a comma ("Gouda
 * jung, Scheiben"), without pack sizes, amounts and percentages ("500 g", "1,5 %", "10er") or filler.
 */
function shownWords(name: string): string[] {
  const head = name.split(' · ')[0]!.split(/,\s/)[0]!;
  return head
    .split(/[\s/()]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%!]+$/gu, ''))
    .filter((w) => w && !/\d/.test(w) && !w.includes('%') && !FILLER.has(normalize(w)));
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** About what fits under a tile at 360 px. A longer name is cut with "…" on the screen. */
export const SHORT_NAME_FITS = 10;

export interface Nameable {
  id: string;
  /** As shown in full ("Pizza Diavola · Gustavo Gusto"). */
  name: string;
  /** Its icon, or undefined for a monogram: things share a short name only within the same icon. */
  icon?: FoodIconName;
  /** The English name of the BLS food it is linked to, for a long German product name ("Chickpeas"). */
  english?: string;
}

/**
 * Short names for things shown side by side: the name when it fits, else its first word, but among things with the
 * same icon and the same first word, the first word that tells them apart (two pizzas: "Diavola",
 * "Margherita"; the picture already says pizza). A first word longer than fits gives way to the
 * English name of the linked BLS food when that is short and not taken ("Kichererbsen" → "Chickpeas").
 */
export function shortNames(items: readonly Nameable[]): Map<string, string> {
  const out = new Map<string, string>();
  const words = new Map(items.map((i) => [i.id, shownWords(i.name)]));
  const firstOf = (i: Nameable) => words.get(i.id)![0] ?? i.name.trim();
  const groups = new Map<string, Nameable[]>();
  for (const i of items) {
    const key = `${i.icon ?? ''}|${normalize(firstOf(i))}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  }
  for (const group of groups.values()) {
    for (const i of group) {
      // On its own: its whole name when that fits ("Oat flakes"), else the first word ("Pizza").
      const whole = words.get(i.id)!.join(' ');
      let name = whole && whole.length <= SHORT_NAME_FITS ? whole : firstOf(i);
      if (group.length > 1) {
        // The first word that not all of the look-alikes share.
        const others = group.filter((o) => o !== i).map((o) => new Set(words.get(o.id)!.map(normalize)));
        const own = words.get(i.id)!.find((w) => others.some((o) => !o.has(normalize(w))));
        if (own) name = own;
      }
      out.set(i.id, cap(name));
    }
  }
  // Long German product names: the English food name, when it is short and says something new.
  const taken = new Set([...out.values()].map(normalize));
  for (const i of items) {
    const name = out.get(i.id)!;
    // The whole head of the food's name when it fits ("Oat flakes"), else its first word ("Chickpeas").
    const head = i.english ? shownWords(i.english) : [];
    const whole = head.join(' ');
    const english = whole && whole.length <= SHORT_NAME_FITS ? whole : head[0];
    if (name.length > SHORT_NAME_FITS && english && english.length <= SHORT_NAME_FITS && !taken.has(normalize(english))) {
      out.set(i.id, cap(english));
      taken.add(normalize(english));
    }
  }
  return out;
}
