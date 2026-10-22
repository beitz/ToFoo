import { useEffect, useRef, useState } from 'react';
import { QUIET_RMS, rms, shouldCut } from '../../ai/segments';

export type RecorderState = { kind: 'idle' } | { kind: 'recording'; startedAt: number } | { kind: 'denied' } | { kind: 'unsupported' };

/** Compressed speech formats Chrome can record, smallest first; the API accepts all of them. */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

/** The kept whole recording: Opus speech is clear at this rate, at most about 240 kB a minute (Chrome's default is ~4× that). */
const KEPT_BITS_PER_SECOND = 32_000;

/** How often the level is checked for a pause. */
const CHECK_MS = 200;

interface Part {
  rec: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
}

/**
 * Record from the microphone, in parts (src/ai/segments.ts): each part is a complete audio file,
 * handed to `onPart` as soon as it ends, so long recordings can be typed up while the user keeps
 * talking. `start` asks for permission the first time; `stop` ends the last part. The microphone is
 * released as soon as recording stops or the page closes. With `onWhole`, the whole recording is
 * also kept as one file and handed on when it stops (parts overlap and can't simply be joined).
 */
export function useRecorder(onPart: (audio: Blob) => void, onWhole?: (audio: Blob, ms: number) => void) {
  const [state, setState] = useState<RecorderState>({ kind: 'idle' });
  const stream = useRef<MediaStream | null>(null);
  const part = useRef<Part | null>(null);
  const mimeType = useRef<string | undefined>(undefined);
  const monitor = useRef<{ ctx: AudioContext | undefined; timer: number } | null>(null);
  const onPartRef = useRef(onPart);
  onPartRef.current = onPart;
  const onWholeRef = useRef(onWhole);
  onWholeRef.current = onWhole;
  const whole = useRef<Part | null>(null);

  const release = () => {
    if (monitor.current) {
      window.clearInterval(monitor.current.timer);
      void monitor.current.ctx?.close().catch(() => undefined);
      monitor.current = null;
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    part.current = null;
    whole.current = null;
  };
  useEffect(() => {
    return release;
  }, []);

  function startPart(s: MediaStream, audioBitsPerSecond?: number): Part {
    const rec = new MediaRecorder(s, { ...(mimeType.current ? { mimeType: mimeType.current } : {}), ...(audioBitsPerSecond ? { audioBitsPerSecond } : {}) });
    const p: Part = { rec, chunks: [], startedAt: Date.now() };
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) p.chunks.push(e.data);
    };
    // Chunks every second, so a recording survives the page being backgrounded mid-way.
    rec.start(1000);
    return p;
  }

  /** End a part; resolves once its audio is handed on. */
  function endPart(p: Part, to: (audio: Blob, ms: number) => void = (audio) => onPartRef.current(audio)): Promise<void> {
    return new Promise((resolve) => {
      p.rec.onstop = () => {
        const blob = new Blob(p.chunks, { type: p.rec.mimeType || 'audio/webm' });
        if (blob.size > 0) to(blob, Date.now() - p.startedAt);
        resolve();
      };
      p.rec.stop();
    });
  }

  /** Watch the level and start a new part at a pause; without Web Audio, parts end at the maximum length. */
  function watch(s: MediaStream) {
    let quietSince: number | undefined;
    let read: (() => number) | undefined;
    let ctx: AudioContext | undefined;
    try {
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(s).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      read = () => {
        analyser.getFloatTimeDomainData(buf);
        return rms(buf);
      };
    } catch {
      read = undefined;
    }
    const timer = window.setInterval(() => {
      const p = part.current;
      if (!p || !stream.current) return;
      const now = Date.now();
      if (read && read() < QUIET_RMS) quietSince ??= now;
      else quietSince = undefined;
      if (shouldCut(now - p.startedAt, quietSince === undefined ? 0 : now - quietSince)) {
        // The next part starts before this one stops, so nothing said in between is lost.
        part.current = startPart(stream.current);
        quietSince = undefined;
        void endPart(p);
      }
    }, CHECK_MS);
    monitor.current = { ctx, timer };
  }

  async function start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState({ kind: 'unsupported' });
      return;
    }
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setState({ kind: 'denied' });
      return;
    }
    mimeType.current = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
    stream.current = s;
    part.current = startPart(s);
    if (onWholeRef.current) whole.current = startPart(s, KEPT_BITS_PER_SECOND);
    watch(s);
    setState({ kind: 'recording', startedAt: Date.now() });
  }

  /** Stop recording; resolves once the last part is handed on. */
  async function stop(): Promise<void> {
    const p = part.current;
    const w = whole.current;
    if (monitor.current) window.clearInterval(monitor.current.timer);
    part.current = null;
    whole.current = null;
    await Promise.all([p && endPart(p), w && endPart(w, (audio, ms) => onWholeRef.current?.(audio, ms))]);
    release();
    setState({ kind: 'idle' });
  }

  return { state, start, stop };
}
