import { describe, expect, it } from 'vitest';
import { audioFileName, errorForStatus, MAX_AUDIO_BYTES, TRANSCRIBE_MODEL, TRANSCRIBE_URL, transcribe } from './transcribe';

describe('voice transcription', () => {
  it('sends the recording with the model and the key, and returns the text', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ text: ' Zwei Kugeln Eis, Vanille. \n' }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await transcribe(new Blob(['x'], { type: 'audio/webm;codecs=opus' }), 'sk-test', fetchFn);
    expect(r).toEqual({ ok: true, text: 'Zwei Kugeln Eis, Vanille.' });
    expect(seen!.url).toBe(TRANSCRIBE_URL);
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const form = seen!.init.body as FormData;
    expect(form.get('model')).toBe(TRANSCRIBE_MODEL);
    expect((form.get('file') as File).name).toBe('recording.webm');
  });

  it('maps failures to messages the user can act on', async () => {
    const status = (s: number) => (async () => new Response('{}', { status: s })) as unknown as typeof fetch;
    expect(await transcribe(new Blob(['x']), 'k', status(401))).toEqual({ ok: false, error: 'auth' });
    expect(await transcribe(new Blob(['x']), 'k', status(429))).toEqual({ ok: false, error: 'rateLimit' });
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await transcribe(new Blob(['x']), 'k', offline)).toEqual({ ok: false, error: 'network' });
    expect(await transcribe({ size: MAX_AUDIO_BYTES + 1, type: 'audio/webm' } as Blob, 'k', offline)).toEqual({ ok: false, error: 'tooLong' });
    expect([403, 413, 503, 400].map(errorForStatus)).toEqual(['auth', 'tooLong', 'overloaded', 'other']);
  });

  it('names the file after the recorded format', () => {
    expect(audioFileName('audio/mp4')).toBe('recording.m4a');
    expect(audioFileName('audio/ogg;codecs=opus')).toBe('recording.ogg');
    expect(audioFileName('')).toBe('recording.webm');
  });
});
