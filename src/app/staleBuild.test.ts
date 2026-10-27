// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeAiError } from '../ai/client';
import { takeAsk } from './ask';
import { isStaleBuildError, reloadForUpdate } from './staleBuild';
import { getUpdateState, resetUpdates } from './update';

// The error Chrome gave on the owner's phone (2026-10-27), and Safari's and Firefox's wording.
const chrome = new TypeError('Failed to fetch dynamically imported module: https://beitz.github.io/ToFoo/assets/index-sRDF7iEp.js');

describe('an app left open across an update', () => {
  afterEach(() => {
    resetUpdates();
    vi.restoreAllMocks();
  });

  it('tells a missing file of an old version from other errors', () => {
    expect(isStaleBuildError(chrome)).toBe(true);
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleBuildError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isStaleBuildError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isStaleBuildError(new Error('Connection error.'))).toBe(false);
  });

  it('says the assistant needs a reload, not a connection, and offers the new version on Home', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"version":"0.1.200"}')));
    expect(await describeAiError(chrome)).toEqual({ kind: 'update', detail: expect.stringContaining('index-sRDF7iEp.js') });
    expect(getUpdateState().status).toBe('ready');
    vi.unstubAllGlobals();
  });

  it('keeps the message being typed over the reload, once', () => {
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    reloadForUpdate('Can you check all foods I logged?');
    expect(reload).toHaveBeenCalled();
    expect(takeAsk()).toBe('Can you check all foods I logged?');
    expect(takeAsk()).toBeNull();
  });
});
