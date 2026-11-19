import { expect, test, type Page } from '@playwright/test';
import { firstLaunch, logFood, loggedKcal, todayKcal, watchErrors } from './helpers';

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

type Request = { tools: Array<{ name: string }>; messages: Array<{ role: string; content: unknown }> };

/** The first request of the chat gets a change card for the oat flakes and a delete card for the journal entry, by their refs. */
async function fakeClaude(page: Page): Promise<Request[]> {
  const requests: Request[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const body = route.request().postDataJSON() as Request;
    requests.push(body);
    const text = JSON.stringify(body.messages);
    const food = /(e\d+) \d\d:\d\d Oat flakes/.exec(text)?.[1];
    const note = /(j\d+) \d\d:\d\d \\"Headache since lunch/.exec(text)?.[1];
    const reply =
      requests.length === 1 && food && note
        ? sse(
            [
              { type: 'text', text: 'Here are the two fixes.' },
              { type: 'tool_use', id: 'c', name: 'propose_change', input: { edits: [{ ref: food, grams: 50 }], reason: 'Only half a bowl' } },
              { type: 'tool_use', id: 'x', name: 'propose_delete', input: { refs: [note], reason: 'Not wanted' } },
            ],
            'tool_use',
          )
        : sse([{ type: 'text', text: 'Nothing to change.' }], 'end_turn');
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: reply });
  });
  return requests;
}

test('with recent days ticked, the assistant sees what is logged and changes or deletes it only on a tap, with undo', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await logFood(page, 'oat flakes', /^Oat flakes/, '100 g');
  const before = await loggedKcal(page);
  await page.goto('./#/journal/new');
  await page.getByRole('textbox', { name: /Write anything/ }).fill('Headache since lunch');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Headache since lunch/ })).toBeVisible();

  await page.goto('./#/settings/assistant');
  await page.getByRole('switch', { name: /^Use the AI assistant/ }).click();
  await page.getByLabel('API key').fill('sk-ant-test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('switch', { name: 'Send recent days with a chat' }).click();
  await page.getByRole('radio', { name: '2' }).click();
  const requests = await fakeClaude(page);

  await page.goto('./#/assistant');
  const tick = page.getByRole('checkbox', { name: 'Send today and the 2 days before' });
  await expect(tick).toBeChecked();
  await page.getByRole('textbox', { name: /oats at 8/ }).fill('I only had half the oats, and drop the headache note');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Here are the two fixes.')).toBeVisible();
  const first = JSON.stringify(requests[0]);
  expect(first).toContain("Recent days from the user's diary");
  expect(requests[0]!.tools.map((t) => t.name)).toEqual(expect.arrayContaining(['propose_change', 'propose_delete']));
  await expect(page.getByText('This chat has today and the 2 days before.')).toBeVisible();

  // Nothing has changed until a card is tapped.
  await expect(page.getByText('Only half a bowl')).toBeVisible();
  await expect(page.getByText(/^100 g$/)).toBeVisible();
  await expect(page.getByText(/^50 g$/)).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll('.edit-card').length)).toBe(2);
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await expect(page.getByText('Changed: Oat flakes.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  // Both kept: back Home. Half the oats now, and the journal entry is gone until Undo.
  await expect.poll(() => todayKcal(page)).toBeLessThan(before * 0.6);
  await page.goto('./#/journal');
  await expect(page.getByRole('button', { name: /Headache since lunch/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.getByRole('button', { name: /Headache since lunch/ })).toBeVisible();
  expect(errors).toEqual([]);
});
