import { useEffect, useState } from 'react';
import { t } from '../../i18n';

/** Seconds since recording started, ticking. */
export function RecordingTime({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <>{t('voice.recording', { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })}</>;
}
