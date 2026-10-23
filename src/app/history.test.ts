// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBackCloses } from './history';

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.restoreAllMocks());

describe('useBackCloses', () => {
  it('still takes its own entry away when the layer closes on the same page', async () => {
    window.history.replaceState({ tofooPage: 0 }, '', '#/');
    const go = vi.spyOn(window.history, 'go');
    const { rerender, unmount } = renderHook(({ open }) => useBackCloses(open, () => undefined), { initialProps: { open: true } });
    await tick();
    rerender({ open: false });
    await tick();
    expect(go).toHaveBeenCalledWith(-1);
    // Let the traversal land, as in a browser.
    await new Promise((r) => setTimeout(r, 50));
    unmount();
  });

  it('leaves the new page alone when a browser keeps the layer state while the URL is replaced (Safari)', async () => {
    window.history.replaceState({ tofooPage: 0 }, '', '#/');
    const go = vi.spyOn(window.history, 'go');
    const { rerender, unmount } = renderHook(({ open }) => useBackCloses(open, () => undefined), { initialProps: { open: true } });
    await tick();
    expect((window.history.state as { tofooLayer?: number }).tofooLayer).toBe(1);

    // What WebKit does on location.replace('#/log'): same entry, new URL, old state.
    window.history.replaceState(window.history.state, '', '#/log');
    rerender({ open: false });
    await tick();
    expect(go).not.toHaveBeenCalled();
    unmount();
  });
});
