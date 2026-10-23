import { href } from '../../app/router';
import { applyUpdate, useAppUpdate } from '../../app/update';
import { t } from '../../i18n';
import { Icon } from '../../ui/Icon';

/** The app's version, small, above the date on Home (owner's ask); taps through to About. */
export function AppVersion() {
  const u = useAppUpdate();
  return (
    <a className="app-version muted" href={href('about')}>
      {t('version.label', { v: __APP_VERSION__ })}
      {u.status === 'downloading' && ` · ${t('version.downloading')}`}
    </a>
  );
}

/** One line under the header once a new version is in place: tap to load it. */
export function UpdateLine() {
  const u = useAppUpdate();
  if (u.status !== 'ready') return null;
  return (
    <button type="button" className="catchup-line update-line" onClick={applyUpdate}>
      <Icon name="download" size={18} />
      <span className="catchup-text">
        <strong>{u.next ? t('version.readyNamed', { v: u.next }) : t('version.ready')}</strong> {t('version.tapToLoad')}
      </span>
    </button>
  );
}
