import { t } from '../../i18n';

/** A part of a recording could not be typed up: try again, or drop it and keep the rest. */
export function VoiceFailed({ onRetry, onDrop }: { onRetry: () => void; onDrop: () => void }) {
  return (
    <div className="voice-failed small" role="alert">
      <span>{t('voice.partFailed')}</span>
      <span className="row">
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {t('voice.retry')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDrop}>
          {t('voice.drop')}
        </button>
      </span>
    </div>
  );
}
