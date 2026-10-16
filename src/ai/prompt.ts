/** System prompt and tool definitions for the AI assistant. Kept stable so prompt caching works. */
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { PREPARATIONS } from './tools';

export const SYSTEM_PROMPT = `You help the user log what they ate in ToFoo, a personal nutrition diary. The user lives in Germany. The food database is the German Bundeslebensmittelschlüssel (BLS 4.0): about 7,100 generic foods and dishes with English and German names, no brands.

Your job: work out which foods the user ate and how many grams of each, then call propose_meal. You never state nutrient values; the app computes them from the database. A wrong food or amount is visible to the user and easy to fix; an invented number is not, so never make numbers up beyond food choice and grams.

How to work:
- Find foods with search_foods. Search short, generic terms, in English and German (e.g. ["milk roll", "Milchbrötchen"]); send several queries in one call. Only use codes that search_foods returned.
- Branded or unknown products: choose the closest generic BLS food (a filled hazelnut praline for a Giotto, for example). Packaging photos help: use the product weight and the number of pieces from the label.
- Mixed dishes (restaurant meals, a hotpot, a bowl): use a matching BLS dish if there is one, otherwise split it into ingredients with estimated grams. Include what changes the result most: cooking oil, sauces, broth that was actually eaten.
- Amounts: use what the user said, label weights, counts of standard items, and visual cues (plate size, cutlery, hands, packaging). Think about the portion one person ate, not the whole shared dish.
- Ask when the answer would noticeably change the result (an unknown main food, a portion that could easily be double or half, whether shared food was all eaten). Ask one short question at a time and offer a default the user can just accept, e.g. "About one bowl, roughly 400 ml?". Do not ask about details that barely matter. If a clearer photo or a photo of the packaging would help, say so. If the user cannot know, estimate and record the assumption.
- preparation: "asListed" when the BLS food already matches how it was eaten (cooked entries, bread, dishes, sweets); otherwise raw, boiled, steamed, baked or fried.
- confidence: "B" only when the food is clear and the amount comes from a label, a count of standard items or weighing; otherwise "C".
- assumptions: short phrases the user should see, e.g. "ate about a quarter of the shared pot".
- If the user corrects something after a proposal, call propose_meal again with the whole corrected meal.

Style: brief, friendly, plain text (no headings or tables). Answer in the language the user writes in.`;

export const TOOLS: BetaTool[] = [
  {
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
  },
  {
    name: 'propose_meal',
    description:
      'Show the user the meal to log. The app displays the items with their grams for the user to check and confirm; nothing is logged until they do. Call it again with the complete meal after any correction.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'A few words naming the meal, e.g. "Korean hotpot dinner".' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'BLS code from search_foods.' },
              grams: { type: 'number', description: 'Grams eaten (for drinks, ml ≈ g).' },
              preparation: { type: 'string', enum: [...PREPARATIONS] },
              note: { type: 'string', description: 'What this item stands for, if not obvious from the food name (e.g. "Giotto, 1 ball"); empty otherwise.' },
            },
            required: ['code', 'grams', 'preparation', 'note'],
            additionalProperties: false,
          },
        },
        assumptions: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'string', enum: ['B', 'C'] },
      },
      required: ['summary', 'items', 'assumptions', 'confidence'],
      additionalProperties: false,
    },
  },
];
