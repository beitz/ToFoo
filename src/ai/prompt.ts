/**
 * System prompt and tool definitions for the AI assistant, in two fixed variants (with and without
 * the Open Food Facts lookup), each kept stable so prompt caching works.
 */
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { PREPARATIONS } from './tools';

const BRANDED_BLS_ONLY = `- Branded or unknown products: choose the closest generic BLS food (a filled hazelnut praline for a Giotto, for example). Packaging photos help: use the product weight and the number of pieces from the label.`;

const BRANDED_WITH_PRODUCTS = `- Packaged products can be looked up by barcode in Open Food Facts with lookup_barcode, which returns the label values. Barcodes the app read from the user's photos are given to you in the message; you may also read the digits printed under a barcode in a photo, or the user may type them. Products the user logged before are also listed by search_foods, with codes like OFF:4008400121925. Use the product's OFF: code in propose_meal and set micros_from to the BLS code of the most similar generic food (from search_foods; a filled hazelnut praline for a Giotto, for example), which supplies the vitamins and minerals the label lacks. If the product already has a similar food chosen by the user, micros_from can be empty. Do not guess barcodes. When there is no barcode or the product is not found, choose the closest generic BLS food instead. Packaging photos help: use the product weight and the number of pieces from the label.`;

function systemPrompt(withProducts: boolean): string {
  return `You help the user log what they ate in ToFoo, a personal nutrition diary. The user lives in Germany. The food database is the German Bundeslebensmittelschlüssel (BLS 4.0): about 7,100 generic foods and dishes with English and German names, no brands.${withProducts ? ' Packaged products can also be looked up by barcode in Open Food Facts.' : ''}

Your job: work out which foods the user ate and how many grams of each, then call propose_meal. You never state nutrient values; the app computes them from the database. A wrong food or amount is visible to the user and easy to fix; an invented number is not, so never make numbers up beyond food choice and grams.

How to work:
- Find foods with search_foods. Search short, generic terms, in English and German (e.g. ["milk roll", "Milchbrötchen"]); send several queries in one call. Only use codes that search_foods returned.
${withProducts ? BRANDED_WITH_PRODUCTS : BRANDED_BLS_ONLY}
- Mixed dishes (restaurant meals, a hotpot, a bowl): use a matching BLS dish if there is one, otherwise split it into ingredients with estimated grams. Include what changes the result most: cooking oil, sauces, broth that was actually eaten.
- Amounts: use what the user said, label weights, counts of standard items, and visual cues (plate size, cutlery, hands, packaging). Think about the portion one person ate, not the whole shared dish.
- Ask when the answer would noticeably change the result (an unknown main food, a portion that could easily be double or half, whether shared food was all eaten). Ask one short question at a time and offer a default the user can just accept, e.g. "About one bowl, roughly 400 ml?". Do not ask about details that barely matter. If a clearer photo or a photo of the packaging would help, say so. If the user cannot know, estimate and record the assumption.
- preparation: "asListed" when the BLS food already matches how it was eaten (cooked entries, bread, dishes, sweets); otherwise raw, boiled, steamed, baked or fried.
- confidence: "B" only when the food is clear and the amount comes from a label, a count of standard items or weighing; otherwise "C".
- assumptions: short phrases the user should see, e.g. "ate about a quarter of the shared pot".
- If the user corrects something after a proposal, call propose_meal again with the whole corrected meal.

Style: brief, friendly, plain text (no headings or tables). Answer in the language the user writes in.`;
}

export const SYSTEM_PROMPT = systemPrompt(false);
export const SYSTEM_PROMPT_WITH_PRODUCTS = systemPrompt(true);

const LOOKUP_BARCODE: BetaTool = {
  name: 'lookup_barcode',
  description:
    'Look up packaged products by barcode (EAN/UPC digits) in Open Food Facts. Returns per product: "OFF:code | name (brand) | pack and serving size | label values per 100 g | similar BLS food if the user chose one", or that it was not found.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      barcodes: { type: 'array', items: { type: 'string' }, description: 'Up to 4 barcodes, digits only, e.g. ["4008400121925"].' },
    },
    required: ['barcodes'],
    additionalProperties: false,
  },
};

function tools(withProducts: boolean): BetaTool[] {
  const items = {
    type: 'object',
    properties: {
      code: { type: 'string', description: withProducts ? 'BLS code from search_foods, or OFF: product code from lookup_barcode or search_foods.' : 'BLS code from search_foods.' },
      grams: { type: 'number', description: 'Grams eaten (for drinks, ml ≈ g).' },
      preparation: { type: 'string', enum: [...PREPARATIONS] },
      note: { type: 'string', description: 'What this item stands for, if not obvious from the food name (e.g. "Giotto, 1 ball"); empty otherwise.' },
      ...(withProducts
        ? { micros_from: { type: 'string', description: 'For OFF: products only: BLS code of the most similar generic food, for the nutrients the label lacks. Empty for BLS foods.' } }
        : {}),
    },
    required: ['code', 'grams', 'preparation', 'note', ...(withProducts ? ['micros_from'] : [])],
    additionalProperties: false,
  };
  return [
    SEARCH_FOODS,
    ...(withProducts ? [LOOKUP_BARCODE] : []),
    {
      name: 'propose_meal',
      description:
        'Show the user the meal to log. The app displays the items with their grams for the user to check and confirm; nothing is logged until they do. Call it again with the complete meal after any correction.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'A few words naming the meal, e.g. "Korean hotpot dinner".' },
          items: { type: 'array', items },
          assumptions: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'string', enum: ['B', 'C'] },
        },
        required: ['summary', 'items', 'assumptions', 'confidence'],
        additionalProperties: false,
      },
    },
  ];
}

const SEARCH_FOODS: BetaTool = {
  name: 'search_foods',
  description:
    'Search the bundled BLS 4.0 food database. Each query returns up to 8 foods as "code | English name | German name | group | energy and macros per 100 g". Use short generic words; English and German both work.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      queries: { type: 'array', items: { type: 'string' }, description: 'Up to 6 search terms, e.g. ["hazelnut praline", "Nougat"].' },
    },
    required: ['queries'],
    additionalProperties: false,
  },
};

export const TOOLS = tools(false);
export const TOOLS_WITH_PRODUCTS = tools(true);
