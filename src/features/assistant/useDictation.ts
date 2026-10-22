import { useEffect, useRef, useState } from 'react';
import { useData } from '../../app/data';
import type { MessageKey } from '../../i18n';
import { getOpenAiKey, transcribe, TRANSCRIBE_PROMPT, type TranscribeError, type TranscribeResult } from '../../ai/transcribe';
import { promptWithContext } from '../../ai/segments';
import { isOn } from '../../settings/features';
import { useRecorder } from './useRecorder';

export { appendText } from '../../ai/segments';

/** Waits before trying a part again after a passing problem (busy, rate limit, connection). */
const RETRY_DELAYS_MS = [2000, 6000];
const PASSING: TranscribeError[] = ['overloaded', 'rateLimit', 'network'];

/**
 * Voice input (opt-in, the user's OpenAI key): record, and each part of the recording goes to
 * `onText` as soon as it is typed up, for the user to check. `continued` is true for the second and
 * later parts of one recording. Parts are typed up one after another, in order; if one fails even
 * after retries, the rest wait until the user tries again or drops it, so the text never comes out
 * of order. Used by the assistant chat and the journal; `prompt` tells the speech model what it will
 * hear. `onAudio`, if given, gets each whole recording when it stops (the chat keeps it).
 */
export function useDictation({
  onText,
  onError,
  onAudio,
  prompt = TRANSCRIBE_PROMPT,
}: {
  onText: (text: string, continued: boolean) => void;
  onError: (key: MessageKey) => void;
  onAudio?: (audio: Blob, ms: number) => void;
  prompt?: string;
}) {
  const d = useData();
  const voiceOn = isOn(d.settings.features, 'voiceInput');
  const [voiceKey, setVoiceKey] = useState('');
  useEffect(() => {
    if (voiceOn) void getOpenAiKey().then(setVoiceKey);
  }, [voiceOn]);
  // The callbacks change on every render; the queue reads the latest ones.
  const latest = useRef({ onText, onError, onAudio, prompt, voiceKey });
  latest.current = { onText, onError, onAudio, prompt, voiceKey };

  /** Parts recorded and not typed up yet, oldest first; `continued` marks later parts of one recording. */
  const queue = useRef<Array<{ audio: Blob; continued: boolean }>>([]);
  const [waiting, setWaiting] = useState(0);
  const [failed, setFailed] = useState(false);
  const failedRef = useRef(false);
  const working = useRef(false);
  /** The text of the recording so far, as context for its next part. */
  const sofar = useRef('');
  const partsThisRecording = useRef(0);

  const recorder = useRecorder((audio) => {
    queue.current.push({ audio, continued: partsThisRecording.current > 0 });
    partsThisRecording.current++;
    setWaiting(queue.current.length);
    void pump();
  }, onAudio && ((audio, ms) => latest.current.onAudio?.(audio, ms)));

  useEffect(() => {
    if (recorder.state.kind === 'denied') latest.current.onError('voice.error.denied');
    if (recorder.state.kind === 'unsupported') latest.current.onError('voice.error.unsupported');
  }, [recorder.state.kind]);

  async function typeUp(audio: Blob, continued: boolean): Promise<TranscribeResult> {
    const { voiceKey: key, prompt: p } = latest.current;
    const withContext = continued ? promptWithContext(p, sofar.current) : p;
    let r = await transcribe(audio, key, fetch, withContext);
    for (const delay of RETRY_DELAYS_MS) {
      if (r.ok || !PASSING.includes(r.error)) break;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      r = await transcribe(audio, key, fetch, withContext);
    }
    return r;
  }

  async function pump() {
    if (working.current || failedRef.current) return;
    working.current = true;
    try {
      for (let next = queue.current[0]; next; next = queue.current[0]) {
        const r = await typeUp(next.audio, next.continued);
        if (!r.ok) {
          failedRef.current = true;
          setFailed(true);
          latest.current.onError(`voice.error.${r.error}`);
          return;
        }
        queue.current.shift();
        setWaiting(queue.current.length);
        if (r.text) {
          sofar.current = next.continued ? `${sofar.current} ${r.text}` : r.text;
          latest.current.onText(r.text, next.continued);
        } else if (!next.continued) latest.current.onError('voice.error.empty');
      }
    } finally {
      working.current = false;
    }
  }

  async function toggle() {
    if (recorder.state.kind !== 'recording') {
      partsThisRecording.current = 0;
      await recorder.start();
      return;
    }
    await recorder.stop();
    if (partsThisRecording.current === 0) onError('voice.error.empty');
  }

  function retry() {
    failedRef.current = false;
    setFailed(false);
    void pump();
  }

  /** Give up on the part that failed (its words are lost) and type up the rest. */
  function drop() {
    queue.current.shift();
    setWaiting(queue.current.length);
    retry();
  }

  const recording = recorder.state.kind === 'recording';
  return {
    available: voiceOn && !!voiceKey,
    recording,
    startedAt: recorder.state.kind === 'recording' ? recorder.state.startedAt : undefined,
    /** Recording stopped and parts are still being typed up. */
    transcribing: !recording && waiting > 0 && !failed,
    /** A part could not be typed up; the user can try again or drop it. */
    failed: failed && waiting > 0,
    /** Recording, or text still to come: sending now would leave words out. */
    busy: recording || waiting > 0,
    retry,
    drop,
    toggle,
  };
}
