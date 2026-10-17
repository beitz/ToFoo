import { useEffect, useRef, useState } from 'react';
import { useData } from '../../app/data';
import type { MessageKey } from '../../i18n';
import { getOpenAiKey, transcribe, TRANSCRIBE_PROMPT } from '../../ai/transcribe';
import { isOn } from '../../settings/features';
import { useRecorder } from './useRecorder';

/**
 * Voice input (opt-in, the user's OpenAI key): record, then the transcript goes to `onText` for
 * the user to check. Used by the assistant chat and the journal; `prompt` tells the speech model
 * what it will hear.
 */
export function useDictation({ onText, onError, prompt = TRANSCRIBE_PROMPT }: { onText: (text: string) => void; onError: (key: MessageKey) => void; prompt?: string }) {
  const d = useData();
  const voiceOn = isOn(d.settings.features, 'voiceInput');
  const [voiceKey, setVoiceKey] = useState('');
  useEffect(() => {
    if (voiceOn) void getOpenAiKey().then(setVoiceKey);
  }, [voiceOn]);
  const recorder = useRecorder();
  const [transcribing, setTranscribing] = useState(false);
  // The callbacks change on every render; the effect below should only run when the recorder does.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (recorder.state.kind === 'denied') onErrorRef.current('voice.error.denied');
    if (recorder.state.kind === 'unsupported') onErrorRef.current('voice.error.unsupported');
  }, [recorder.state.kind]);

  async function toggle() {
    if (recorder.state.kind !== 'recording') {
      await recorder.start();
      return;
    }
    const audio = await recorder.stop();
    if (!audio) {
      onError('voice.error.empty');
      return;
    }
    setTranscribing(true);
    const r = await transcribe(audio, voiceKey, fetch, prompt);
    setTranscribing(false);
    if (!r.ok) onError(`voice.error.${r.error}`);
    else if (r.text) onText(r.text);
    else onError('voice.error.empty');
  }

  return {
    available: voiceOn && !!voiceKey,
    recording: recorder.state.kind === 'recording',
    startedAt: recorder.state.kind === 'recording' ? recorder.state.startedAt : undefined,
    transcribing,
    toggle,
  };
}

/** Append dictated text to what is already typed, on a new line. */
export function appendText(old: string, added: string): string {
  return old.trim() ? `${old.trimEnd()}\n${added}` : added;
}
