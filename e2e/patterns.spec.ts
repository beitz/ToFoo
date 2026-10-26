import { expect, test, type Page } from '@playwright/test';
import { firstLaunch, watchErrors } from './helpers';

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

/** Answers every request: the first of a chat reads the journal, then a plain answer. */
async function fakeClaude(page: Page): Promise<Request[]> {
  const requests: Request[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const body = route.request().postDataJSON() as Request;
    requests.push(body);
    const last = body.messages.at(-1)!;
    const answered = Array.isArray(last.content) && (last.content as Array<{ type: string }>).some((b) => b.type === 'tool_result');
    const canRead = body.tools.some((t) => t.name === 'read_journal');
    const reply =
      canRead && !answered
        ? sse([{ type: 'tool_use', id: `t${requests.length}`, name: 'read_journal', input: { from: '2000-01-01', to: '2100-01-01', words: [] } }], 'tool_use')
        : sse([{ type: 'text', text: canRead ? 'Headaches came up once.' : 'Hello!' }], 'end_turn');
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: reply });
  });
  return requests;
}

test('the assistant sends the journal only once it is ticked, from Home or from Look for patterns', async ({ page }) => {
  const errors = watchErrors(page);
  await firstLaunch(page);
  await page.goto('./#/settings');
  await page.getByText('What you track').click();
  const journal = page.getByRole('switch', { name: /^Journal/ });
  if (!(await journal.isChecked())) await journal.click();
  for (const [text, priv] of [
    ['Headache since lunch', false],
    ['Only for me', true],
  ] as const) {
    await page.goto('./#/journal/new');
    await page.getByRole('textbox', { name: /Write anything/ }).fill(text);
    if (priv) await page.getByRole('switch', { name: /^Private/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(text) })).toBeVisible();
  }
  await page.goto('./#/settings/assistant');
  await page.getByRole('switch', { name: /^Use the AI assistant/ }).click();
  await page.getByLabel('API key').fill('sk-ant-test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('switch', { name: /^Patterns/ }).click();
  const requests = await fakeClaude(page);

  // From Home: closed, nothing ticked, no pattern tools and no journal in the request.
  await page.goto('./#/assistant');
  const chip = page.getByRole('button', { name: 'Include my data' });
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('textbox', { name: /oats at 8/ }).fill('hi');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Hello!')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]!.tools.map((t) => t.name)).not.toContain('read_journal');
  expect(JSON.stringify(requests[0])).not.toContain('Headache since lunch');
  // Not shared yet, so the chip is still there to include data from the next message on.
  await expect(chip).toBeVisible();

  // From Look for patterns: open and ticked, private entries left out; a typed question works too.
  await page.goto('./#/insights');
  await expect(page.getByRole('button', { name: /^Including: food log, journal/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('checkbox', { name: /journal entr/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /private entry/ })).not.toBeChecked();
  await page.getByRole('textbox', { name: /why am I tired/ }).fill('Why the headache?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Headaches came up once.')).toBeVisible();
  const sent = JSON.stringify(requests.slice(1));
  expect(requests[1]!.tools.map((t) => t.name)).toContain('read_journal');
  expect(sent).toContain('Headache since lunch');
  expect(sent).not.toContain('Only for me');
  await expect(page.getByText(/Shared in this chat: food log, journal/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Look for patterns' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
