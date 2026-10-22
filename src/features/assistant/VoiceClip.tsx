import { useEffect, useState } from 'react';
import type { AudioClip } from '../../ai/chatRecord';
import { t } from '../../i18n';

/** m:ss, as the recording timer shows it. */
export function clipTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * A recording the user spoke a message in, to play again (owner's ask, 2026-10-22: the transcript
 * can be wrong, the voice is the source). The length is shown apart, since Chrome's recordings
 * carry no length the player could read.
 */
export function VoiceClip({ clip }: { clip: AudioClip }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([clip.data], { type: clip.mediaType }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [clip]);
  const label = t('voice.clip', { time: clipTime(clip.ms) });
  return (
    <div className="voice-clip">
      <span className="small">{label}</span>
      {url && <audio controls preload="metadata" src={url} aria-label={label} />}
    </div>
  );
}
