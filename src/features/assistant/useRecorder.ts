import { useEffect, useRef, useState } from 'react';

export type RecorderState = { kind: 'idle' } | { kind: 'recording'; startedAt: number } | { kind: 'denied' } | { kind: 'unsupported' };

/** Compressed speech formats Chrome can record, smallest first; the API accepts all of them. */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

/**
 * Record from the microphone. `start` asks for permission the first time; `stop` resolves with the
 * recording. The microphone is released as soon as recording stops or the chat closes.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>({ kind: 'idle' });
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const release = () => {
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
  };
  useEffect(() => {
    return release;
  }, []);

  async function start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState({ kind: 'unsupported' });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState({ kind: 'denied' });
      return;
    }
    const mimeType = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    // Chunks every second, so a recording survives the page being backgrounded mid-way.
    rec.start(1000);
    recorder.current = rec;
    setState({ kind: 'recording', startedAt: Date.now() });
  }

  function stop(): Promise<Blob | undefined> {
    const rec = recorder.current;
    if (!rec) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        chunks.current = [];
        release();
        setState({ kind: 'idle' });
        resolve(blob.size > 0 ? blob : undefined);
      };
      rec.stop();
    });
  }

  return { state, start, stop };
}
