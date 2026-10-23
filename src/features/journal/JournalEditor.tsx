import { useEffect, useRef, useState } from 'react';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { JOURNAL_TRANSCRIBE_PROMPT } from '../../ai/transcribe';
import { Icon } from '../../ui/Icon';
import { TimeField } from '../log/TimeField';
import { RecordingTime } from '../assistant/RecordingTime';
import { appendText, useDictation } from '../assistant/useDictation';
import { VoiceFailed } from '../assistant/VoiceFailed';

/**
 * Writing a journal entry: plain text (no fields to fill in), the microphone when voice input is
 * set up, and the time, which defaults to now.
 */
export function JournalEditor({
  text,
  onText,
  time,
  onTime,
  autoFocus,
  onBusy,
}: {
  text: string;
  onText: (update: (old: string) => string) => void;
  time: number;
  onTime: (t: number) => void;
  autoFocus?: boolean;
  /** Recording or transcribing: saving now would lose what is being said. */
  onBusy?: (busy: boolean) => void;
}) {
  const [error, setError] = useState<MessageKey>();
  const area = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation({ onText: (added, continued) => onText((old) => appendText(old, added, continued)), onError: setError, prompt: JOURNAL_TRANSCRIBE_PROMPT });
  const busy = dictation.busy;
  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);
  useEffect(() => {
    // Open straight into writing; the phone keyboard comes up with it.
    if (autoFocus) area.current?.focus();
  }, [autoFocus]);

  return (
    <div className="journal-editor">
      <textarea
        ref={area}
        rows={5}
        value={text}
        placeholder={t('journal.placeholder')}
        aria-label={t('journal.placeholder')}
        onChange={(e) => {
          const v = e.target.value;
          onText(() => v);
        }}
      />
      {dictation.available && (
        <div className="row journal-voice">
          <button
            type="button"
            className={`btn btn-secondary btn-small${dictation.recording ? ' composer-recording' : ''}`}
            aria-pressed={dictation.recording}
            disabled={dictation.transcribing}
            onClick={() => {
              setError(undefined);
              void dictation.toggle();
            }}
          >
            <Icon name={dictation.recording ? 'stop' : 'mic'} size={18} filled={dictation.recording} /> {t(dictation.recording ? 'voice.stop' : 'journal.speak')}
          </button>
          {dictation.startedAt !== undefined ? (
            <span className="voice-status small" role="status">
              <span className="rec-dot" aria-hidden="true" /> <RecordingTime since={dictation.startedAt} /> <span className="muted">· {t('voice.sending')}</span>
            </span>
          ) : dictation.transcribing ? (
            <span className="muted small" role="status">
              {t('voice.transcribing')}
            </span>
          ) : (
            // Next to the speak button: the recording leaves the phone, the entry does not (owner's ask, 2026-10-23).
            <span className="muted small grow">
              {t('sent.journalVoiceNote')} <a href={href('about', 'sent')}>{t('sent.more')}</a>
            </span>
          )}
        </div>
      )}
      {dictation.failed && <VoiceFailed onRetry={dictation.retry} onDrop={dictation.drop} />}
      {error && (
        <p className="notice small" role="alert">
          {t(error)}
        </p>
      )}
      <TimeField value={time} onChange={onTime} />
    </div>
  );
}
