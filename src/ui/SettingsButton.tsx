import { href } from '../app/router';
import { t } from '../i18n';
import { Icon } from './Icon';

/** Settings live top right on the three tab screens, out of the daily path (design 2026-10-22). */
export function SettingsButton() {
  return (
    <a className="icon-btn settings-btn" data-tour="settings-button" href={href('settings')} aria-label={t('nav.settings')} title={t('nav.settings')}>
      <Icon name="person" size={22} />
    </a>
  );
}
