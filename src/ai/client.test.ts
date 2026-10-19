import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { describeAiError } from './client';

describe('describeAiError', () => {
  const body = (type: string, message: string) => ({ type: 'error', error: { type, message } });
  const api = (status: number, message = 'x', type = 'invalid_request_error') =>
    Anthropic.APIError.generate(status, body(type, message), message, new Headers({ 'request-id': 'req_1' }));
  const kind = async (e: unknown) => (await describeAiError(e)).kind;

  it('maps API failures to what the user can do about them', async () => {
    expect(await kind(api(401))).toBe('auth');
    expect(await kind(api(429))).toBe('rateLimit');
    expect(await kind(api(529))).toBe('overloaded');
    expect(await kind(new Anthropic.APIConnectionError({ message: 'offline' }))).toBe('network');
    expect(await kind(api(400, 'Web search is not enabled for this organization'))).toBe('webSearchOff');
    expect(await kind(api(400))).toBe('rejected');
    expect(await kind(api(404, 'model: claude-x', 'not_found_error'))).toBe('rejected');
  });

  it('gives the status, type and the service’s own words', async () => {
    const r = await describeAiError(api(400, 'messages.0.content.1.image.source.base64: image exceeds 5 MB maximum'));
    expect(r.detail).toBe('HTTP 400 · invalid_request_error · messages.0.content.1.image.source.base64: image exceeds 5 MB maximum (request req_1)');
  });

  it('sorts errors that arrive mid-answer (no HTTP status) by their type', async () => {
    // What the SDK throws for an `event: error` in the stream.
    const stream = (type: string, message: string) => new Anthropic.APIError(undefined, body(type, message), undefined, undefined, type as never);
    const overloaded = await describeAiError(stream('overloaded_error', 'Overloaded'));
    expect(overloaded).toEqual({ kind: 'overloaded', detail: 'Error during the answer · overloaded_error · Overloaded' });
    expect(await kind(stream('api_error', 'Internal server error'))).toBe('overloaded');
    expect(await kind(stream('rate_limit_error', 'slow down'))).toBe('rateLimit');
    expect(await kind(stream('something_new', '?'))).toBe('other');
  });

  it('tells a fault in the app apart from a failed request', async () => {
    expect(await describeAiError(new TypeError("Cannot read properties of undefined (reading 'ingredients')"))).toEqual({
      kind: 'app',
      detail: "TypeError: Cannot read properties of undefined (reading 'ingredients')",
    });
    expect(await kind(new Anthropic.AnthropicError('stream ended without producing a Message with role=assistant'))).toBe('other');
  });
});
