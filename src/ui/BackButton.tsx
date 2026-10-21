import { goBack } from '../app/router';
import { t } from '../i18n';
import { Icon } from './Icon';

/** Back to where the user came from; `to` (route parts) when the page was opened directly. */
export function BackButton({ to = [] }: { to?: string[] }) {
  return (
    <button className="icon-btn" onClick={() => goBack(...to)} aria-label={t('common.back')}>
      <Icon name="back" />
    </button>
  );
}
