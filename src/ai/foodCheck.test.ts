import { describe, expect, it } from 'vitest';
import type * as Beta from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Food } from '../foods/foodDb';
import { buildIndex } from '../foods/search';
import type { LogEntry, Product } from '../storage/types';
import { emptyConversation, requestParams, sendMessage, type CreateMessage } from './assistant';
import { runCheckLoggedFoods, validateFoodFix, validateMarkChecked, type FoodCheckData } from './foodCheck';
import type { ToolContext } from './tools';

const food = (code: string, nameEn: string, per100: Food['per100']): Food => ({ code, nameEn, nameDe: `${nameEn} (de)`, group: code.charAt(0), per100, provenance: {} });
const foods = [
  food('P161000', 'Pale beer', { ENERCC: 36, FAT: 0, PROT625: 0.4, CHO: 2.3 }),
  food('W271000', 'Beer ham', { ENERCC: 161, FAT: 10.5, PROT625: 16.6, CHO: 0.1 }),
  food('G480100', 'Onion raw', { ENERCC: 30, FAT: 0.2, PROT625: 1.2, CHO: 5 }),
  food('G490100', 'Garlic raw', { ENERCC: 140, FAT: 0.1, PROT625: 6, CHO: 28 }),
];
const db = { byCode: new Map(foods.map((f) => [f.code, f])), groups: { P: { en: 'Alcoholic beverages', de: 'Alkoholische Getränke' }, W: { en: 'Sausages', de: 'Wurst' }, G: { en: 'Vegetables', de: 'Gemüse' } } };

const helles: Product = {
  id: 'OFF:4014086010316',
  schemaVersion: 1,
  source: 'OFF',
  code: '4014086010316',
  name: 'Oettinger Helles',
  brand: 'Oettinger',
  per100: { ENERCC: 42, CHO: 3 },
  categories: ['Beverages', 'Alcoholic beverages', 'Beers'],
  ingredients: [
    { id: 'en:water', text: 'Wasser', percent: 90 },
    { id: 'en:barley-malt', text: 'Gerstenmalz', percent: 9 },
  ],
  match: { version: '4.0', code: 'W271000' },
  fetchedAt: 0,
};
let n = 0;
const entry = (day: string, ref: Extract<LogEntry, { kind: 'food' }>['ref'], grams: number): Extract<LogEntry, { kind: 'food' }> => ({
  id: `e${n++}`,
  schemaVersion: 1,
  kind: 'food',
  ref,
  grams,
  preparation: 'raw',
  time: Date.parse(`${day}T12:00:00`),
  day,
  confidence: 'C',
  label: 'x',
});
const log = [
  entry('2026-10-25', { source: 'OFF', code: '4014086010316' }, 500),
  entry('2026-10-26', { source: 'BLS', version: '4.0', code: 'G490100' }, 120),
  entry('2026-10-10', { source: 'BLS', version: '4.0', code: 'G490100' }, 5),
];
const data: FoodCheckData = { today: '2026-10-27', log, batchesById: new Map(), productsById: new Map([[helles.id, helles]]) };

describe('the assistant checks what was logged', () => {
  it('lists each food once with its label, categories, ingredients, BLS food, flags and entries', () => {
    const r = runCheckLoggedFoods({ days: 7 }, data, db);
    expect(r.ok).toBe(true);
    const [head, beer, garlic] = r.text.split('\n');
    expect(head).toContain('from 2026-10-21 to 2026-10-27: 2, 1 flagged');
    expect(beer).toContain('OFF:4014086010316 | Oettinger Helles');
    expect(beer).toContain('categories: Beverages, Alcoholic beverages, Beers');
    expect(beer).toContain('ingredients: Wasser 90%, Gerstenmalz 9%');
    expect(beer).toContain('its BLS food: W271000 | Beer ham');
    expect(beer).toContain('LABEL AND ITS BLS FOOD DIFFER A LOT');
    expect(beer).toContain('eaten: 2026-10-25 500 g');
    expect(garlic).toContain('BLS:G490100 | Garlic raw');
    // The entry from before the period stays out.
    expect(garlic).toContain('eaten: 2026-10-26 120 g');
    expect(garlic).not.toContain('2026-10-10');
    expect(runCheckLoggedFoods({ days: 0 }, data, db).text).toContain('2026-10-10 5 g');
    expect(runCheckLoggedFoods({ days: 'week' }, data, db).ok).toBe(false);
  });

  it('leaves out what the user already checked, unless asked to include it', () => {
    const checked = { ...data, checked: { 'BLS:G490100': 'BLS' } };
    const r = runCheckLoggedFoods({ days: 7 }, checked, db).text;
    expect(r).toContain('1 more the user already checked are left out');
    expect(r).not.toContain('Garlic raw');
    const all = runCheckLoggedFoods({ days: 7, include_checked: true }, checked, db).text;
    expect(all).toContain('BLS:G490100 | Garlic raw');
    expect(all).toContain('checked by the user');
    // A beer filed as a beer, paired with ham: the kind of food is named.
    expect(runCheckLoggedFoods({ days: 7 }, data, db).text).toContain('A DRINK PAIRED WITH A FOOD');
  });

  it('checks a fix: known keys and codes, BLS foods only by another BLS food, with the entries it changes', () => {
    expect(validateFoodFix({ food: helles.id, use: 'bls', code: 'P161000', days: 7, reason: 'A beer, not a ham', replaces: '' }, data, db)).toEqual({
      ok: true,
      proposal: { food: helles.id, name: 'Oettinger Helles', use: 'bls', code: 'P161000', reason: 'A beer, not a ham' },
    });
    expect(validateFoodFix({ food: helles.id, use: 'label_only', code: '', days: 7, reason: '' }, data, db)).toMatchObject({ ok: true, proposal: { use: 'label_only' } });
    expect(validateFoodFix({ food: helles.id, use: 'bls', code: 'X999', days: 7 }, data, db)).toMatchObject({ ok: false });
    expect(validateFoodFix({ food: helles.id, use: 'bls', code: 'W271000', days: 7 }, data, db)).toMatchObject({ ok: false });
    // 120 g of garlic is surely onion: the fix carries the entries of the period, not older ones.
    const garlic = validateFoodFix({ food: 'BLS:G490100', use: 'bls', code: 'G480100', days: 7, reason: '120 g is an onion' }, data, db);
    expect(garlic).toEqual({ ok: true, proposal: { food: 'BLS:G490100', name: 'Garlic raw', use: 'bls', code: 'G480100', reason: '120 g is an onion', entryIds: [log[1]!.id] } });
    expect(validateFoodFix({ food: 'BLS:G490100', use: 'label_only', days: 7 }, data, db)).toMatchObject({ ok: false });
    expect(validateFoodFix({ food: 'BLS:G480100', use: 'bls', code: 'G490100', days: 7 }, data, db)).toMatchObject({ ok: false });
    expect(validateFoodFix({ food: 'OFF:123', use: 'bls', code: 'P161000', days: 7 }, data, db)).toMatchObject({ ok: false });
  });

  it('offers the tools in the main chat only, and shows fixes as F cards', async () => {
    const names = (sources: Parameters<typeof requestParams>[2]) => (requestParams('claude-opus-5-5', [], sources).tools ?? []).map((t) => ('name' in t ? t.name : ''));
    expect(names({})).not.toContain('check_logged_foods');
    expect(names({ check: true })).toEqual(expect.arrayContaining(['check_logged_foods', 'propose_food_fix', 'propose_mark_checked']));
    expect(String(requestParams('claude-opus-5-5', [], { check: true }).system)).toContain('Checking logged foods');

    const reply = (content: Beta.BetaContentBlock[], stop_reason: Beta.BetaStopReason) =>
      ({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as Beta.BetaMessage;
    const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as Beta.BetaToolUseBlock;
    const responses = [
      reply([toolUse('a', 'check_logged_foods', { days: 7 })], 'tool_use'),
      reply([{ type: 'text', text: 'The beer was paired with ham.' } as Beta.BetaTextBlock, toolUse('b', 'propose_food_fix', { food: helles.id, use: 'bls', code: 'P161000', days: 7, reason: 'A beer, not a ham', replaces: '' })], 'tool_use'),
    ];
    const requests: Beta.MessageCreateParamsNonStreaming[] = [];
    const create: CreateMessage = async (p) => {
      requests.push(structuredClone(p));
      return responses.shift()!;
    };
    const ctx: ToolContext = { db, index: buildIndex([]), foodCheck: data };
    const { conversation, outcome } = await sendMessage(create, 'claude-opus-5-5', emptyConversation(), { text: 'check last week', images: [] }, ctx);
    expect(outcome.kind === 'proposal' && outcome.fixes).toEqual([{ id: 'F1', food: helles.id, name: 'Oettinger Helles', use: 'bls', code: 'P161000', reason: 'A beer, not a ham' }]);
    expect(conversation.fixes).toBe(1);
    // The list went back to the model as the tool's result.
    expect(JSON.stringify(requests[1]!.messages)).toContain('Oettinger Helles');
  });

  it('reads only what the user included: the food log from its period, the kitchen in the ticked places', () => {
    const onions = { ref: { source: 'BLS', version: '4.0', code: 'G480100' }, name: 'Onions', place: 'cupboard' } as const;
    const nothing = runCheckLoggedFoods({ days: 7 }, { ...data, scope: { log: false, kitchen: false } }, db);
    expect(nothing.text).toContain('has not included their food log or their kitchen');
    // The kitchen only: no entries are listed, and the model is told the log is not included.
    const kitchen = runCheckLoggedFoods({ days: 7 }, { ...data, scope: { log: false, kitchen: { places: ['cupboard'], items: [onions] } } }, db).text;
    expect(kitchen).toContain('Foods at home (cupboard): 1');
    expect(kitchen).toContain('BLS:G480100 | Onion raw');
    expect(kitchen).toContain('at home: cupboard');
    expect(kitchen).toContain('did not include their food log');
    expect(kitchen).not.toContain('Helles');
    // The log from its period only (3 days), and a note that the kitchen could be ticked too.
    const both = runCheckLoggedFoods({ days: 0 }, { ...data, scope: { log: '2026-10-25', kitchen: false } }, db).text;
    expect(both).toContain('Foods logged from 2026-10-25 to 2026-10-27: 2');
    expect(both).toContain('from 2026-10-25 on only');
    expect(both).toContain('The kitchen is not included');
    expect(both).not.toContain('2026-10-10');
    const all = runCheckLoggedFoods({ days: 7 }, { ...data, scope: { log: '2026-01-01', kitchen: { places: ['cupboard', 'fridge'], items: [onions] } } }, db).text;
    expect(all).toContain('Foods logged from 2026-10-21 to 2026-10-27 and at home (cupboard, fridge): 3');
    // A BLS food only at home is changed in the Kitchen, not by a fix.
    const fix = validateFoodFix({ food: 'BLS:G480100', use: 'bls', code: 'G490100', days: 7 }, { ...data, scope: { log: false, kitchen: { places: ['cupboard'], items: [onions] } } }, db);
    expect(!fix.ok && fix.error).toContain('changes it in the Kitchen');
  });

  it('marks the foods the check found right in one card: known keys, each once, not checked already', () => {
    expect(validateMarkChecked({ foods: ['BLS:G490100', helles.id, 'BLS:G490100'], reason: 'These look right', replaces: '' }, data, db)).toEqual({
      ok: true,
      proposal: {
        use: 'looks_right',
        foods: [
          { key: 'BLS:G490100', name: 'Garlic raw' },
          { key: helles.id, name: 'Oettinger Helles' },
        ],
        reason: 'These look right',
      },
    });
    // Older entries count too: the card is about the foods, not the days.
    expect(validateMarkChecked({ foods: ['BLS:G490100'] }, { ...data, log: [log[2]!] }, db)).toMatchObject({ ok: true });
    expect(validateMarkChecked({ foods: ['BLS:G480100'] }, data, db)).toMatchObject({ ok: false });
    expect(validateMarkChecked({ foods: [] }, data, db)).toMatchObject({ ok: false });
    const checked = { ...data, checked: { 'BLS:G490100': 'BLS' } };
    expect(validateMarkChecked({ foods: ['BLS:G490100', helles.id] }, checked, db)).toMatchObject({ ok: true, proposal: { foods: [{ key: helles.id }] } });
    expect(validateMarkChecked({ foods: ['BLS:G490100'] }, checked, db)).toMatchObject({ ok: false });
  });
});
