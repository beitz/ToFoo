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
  expect(errors).toEqual([]);
});
