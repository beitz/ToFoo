// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, getUpdateState, resetUpdates, startUpdates, type RegisterSW } from './update';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A fake registration: `update()` finds a new worker when `found` is set. */
function fakeRegistration(found?: () => ServiceWorker) {
  const target = new EventTarget();
  const reg = {
    installing: null as ServiceWorker | null,
    addEventListener: target.addEventListener.bind(target),
    update: vi.fn(async () => {
      if (found) {
        reg.installing = found();
        target.dispatchEvent(new Event('updatefound'));
      }
    }),
  };
  return reg;
}

function fakeWorker(): ServiceWorker {
  const w = new EventTarget() as ServiceWorker & { state: string };
  w.state = 'installing';
  return w;
}

function start(reg: ReturnType<typeof fakeRegistration>) {
  let needReload: (() => void) | undefined;
  const registerSW: RegisterSW = (o) => {
    needReload = o.onNeedReload;
    o.onRegisteredSW?.('sw.js', reg as unknown as ServiceWorkerRegistration);
  };
  startUpdates(registerSW);
  return () => needReload?.();
}

/** jsdom has no service worker; an update needs a page that is already controlled. */
function controlled() {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {} } });
}

afterEach(() => {
  resetUpdates();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('app updates', () => {
  it('says so when the service worker is missing (dev, tests)', async () => {
    expect(await checkForUpdate()).toBe('unavailable');
  });

  it('reports the newest version when the server has nothing new', async () => {
    vi.useFakeTimers();
    controlled();
    start(fakeRegistration());
    expect(await checkForUpdate()).toBe('current');
  });

  it('goes from downloading to ready with the new number, and never reloads by itself', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    controlled();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ version: '0.1.999' })));
    const needReload = start(fakeRegistration(fakeWorker));

    expect(await checkForUpdate()).toBe('downloading');
    needReload();
    expect(getUpdateState().status).toBe('ready');
    await tick();
    expect(getUpdateState()).toEqual({ status: 'ready', next: '0.1.999' });
    expect(reload).not.toHaveBeenCalled();
    // Further checks leave the waiting version alone.
    expect(await checkForUpdate()).toBe('ready');
  });

  it('does not call the first install an update', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: null } });
    start(fakeRegistration(fakeWorker));
    expect(await checkForUpdate()).toBe('current');
  });
});
