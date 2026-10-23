import { href } from '../../app/router';
import { t } from '../../i18n';

/**
 * One line on what leaves the phone from here, with the full list a tap away (docs/SPEC.md,
 * "What leaves your phone"). Shown before the first message, so it does not crowd a chat.
 */
export function SentNote({ text }: { text: string }) {
  return (
    <p className="composer-note muted small sent-note">
      {text} <a href={href('about', 'sent')}>{t('sent.more')}</a>
    </p>
  );
}
