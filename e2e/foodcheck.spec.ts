import { expect, test } from '@playwright/test';
import { firstLaunch, logFood, watchErrors } from './helpers';

/** A streamed API answer (server-sent events), as the Anthropic SDK reads it. */
function sse(content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }>, stop: string): string {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let s = ev('message_start', {
    message: { id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } },
  });
  content.forEach((b, index) => {
    if (b.type === 'text') {
      s += ev('content_block_start', { index, content_block: { type: 'text', text: '' } });
      s += ev('content_block_delta', { index, delta: { type: 'text_delta', text: b.text } });
    } else {
      s += ev('content_block_start', { index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      s += ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } });
    }
    s += ev('content_block_stop', { index });
  });
  return s + ev('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } }) + ev('message_stop', {});
}

test('the assistant checks the logged foods from the check list and a fix card changes the food', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await logFood(page, 'oat flakes', /^Oat flakes/, '100 g');
  await page.goto('./#/settings/assistant');
  await page.getByRole('switch', { name: /^Use the AI assistant/ }).click();
  await page.getByLabel('API key').fill('sk-ant-test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  // Leave only once the key is stored, or the check page may open without the assistant.
  await expect(page.getByText('API key saved.')).toBeVisible();

  // First the model reads the list, then proposes one fix with a short text.
  const bodies: string[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    bodies.push(route.request().postData() ?? '');
    const reply =
      bodies.length === 1
        ? sse([{ type: 'tool_use', id: 't1', name: 'check_logged_foods', input: { days: 7 } }], 'tool_use')
        : sse(
            [
              { type: 'text', text: 'One looks off.' },
              { type: 'tool_use', id: 't2', name: 'propose_food_fix', input: { food: 'BLS:C133000', use: 'bls', code: 'C131000', days: 7, reason: 'Whole grains, not flakes', replaces: '' } },
            ],
            'tool_use',
          );
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: reply });
  });

  await page.goto('./#/settings/check');
  await page.getByRole('button', { name: /^Check the foods I logged in the last 7 days/ }).click();
  const box = page.getByRole('textbox', { name: /oats at 8/ });
  await expect(box).toHaveValue(/^Check the foods I logged in the last 7 days/);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Whole grains, not flakes')).toBeVisible();
  // What the app sent back for check_logged_foods: the oat flakes with what was eaten.
  expect(bodies[1]).toContain('BLS:C133000 | Oat flakes');
  expect(bodies[1]).toContain('100 g');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/Oat flakes: now Oat whole grain, raw/).first()).toBeVisible();

  await page.goto('./#/settings/check');
  await expect(page.getByText('Oat whole grain, raw', { exact: true })).toBeVisible();
  // Fixed by the user: checked, so the next check leaves it out.
  await expect(page.getByRole('heading', { name: 'Checked by you (1)' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the check covers the ticked kitchen places, and what it found right is marked checked in one tap', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await logFood(page, 'oat flakes', /^Oat flakes/, '100 g');
  // At home: oat flakes, and a spice with no food linked (it goes with the spices).
  await page.goto('./#/kitchen');
  const add = page.getByPlaceholder('Add what you bought');
  const main = page.locator('main');
  await add.fill('Wacholderbeeren');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(main.locator('.home-row', { hasText: 'Wacholderbeeren' })).toBeVisible();
  await add.fill('oat flakes');
  await page.getByRole('button', { name: /^Oat flakes/ }).first().click();
  await expect(main.locator('.home-row', { hasText: /Oat flakes/ })).toBeVisible();

  await page.goto('./#/settings/assistant');
  await page.getByRole('switch', { name: /^Use the AI assistant/ }).click();
  await page.getByLabel('API key').fill('sk-ant-test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('API key saved.')).toBeVisible();
  await page.getByRole('switch', { name: /^Patterns/ }).click();

  const bodies: string[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    bodies.push(route.request().postData() ?? '');
    const reply =
      bodies.length === 1
        ? sse([{ type: 'tool_use', id: 't1', name: 'check_logged_foods', input: { days: 0 } }], 'tool_use')
        : sse(
            [
              { type: 'text', text: 'All good.' },
              { type: 'tool_use', id: 't2', name: 'propose_mark_checked', input: { foods: ['BLS:C133000'], reason: 'These look right', replaces: '' } },
            ],
            'tool_use',
          );
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: reply });
  });

  // Include the food log and the kitchen without the spices.
  await page.goto('./#/assistant');
  await page.getByRole('button', { name: 'Include my data' }).click();
  await page.getByRole('checkbox', { name: /days with food logged/ }).check();
  await page.getByRole('checkbox', { name: 'Kitchen: 2 things' }).check();
  await page.getByRole('button', { name: 'Choose places' }).click();
  await page.getByRole('checkbox', { name: 'Spices and herbs: 1' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Kitchen: 2 things' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: /Including: food log, kitchen \(fridge, freezer, cupboard\)/ })).toBeVisible();
  await page.getByRole('textbox', { name: /why am I tired/ }).fill('Check everything');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('These look right')).toBeVisible();
  // The kitchen list went with the message, without the spices; the check listed the oats as at home.
  expect(bodies[0]).toContain('cupboard | Oat flakes');
  expect(bodies[0]).not.toContain('Wacholderbeeren');
  expect(bodies[1]).toContain('at home: cupboard');
  await expect(page.getByText(/Shared in this chat: food log, kitchen \(fridge, freezer, cupboard\)/)).toBeVisible();

  await page.getByRole('button', { name: 'Mark as checked' }).click();
  await expect(page.getByText('1 food marked as checked.').first()).toBeVisible();
  await page.goto('./#/settings/check');
  await expect(page.getByRole('heading', { name: 'Checked by you (1)' })).toBeVisible();
  expect(errors).toEqual([]);
});
