import { useState } from 'react';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { isAppleBrowserTab } from '../../lib/platform';
import { Icon } from '../../ui/Icon';

/**
 * On an iPhone or iPad browser tab, one line at the top of Home: add ToFoo to the Home Screen.
 * Android offers the install by itself; iPhone never does, and a tab's data can be deleted after
 * 7 days without a visit (data safety). Tap shows the steps. No dismissing: it goes away once the
 * app is opened from the Home Screen, which is the only place it should be used.
 */
export function InstallHint() {
  const [open, setOpen] = useState(false);
  if (!isAppleBrowserTab()) return null;
  return (
    <div className="install-hint">
      <button className="catchup-line install-hint-line" aria-expanded={open} aria-controls="install-steps" onClick={() => setOpen((o) => !o)}>
        <Icon name="warning" size={18} />
        <span className="catchup-text">
          <strong>{t('install.ios.line')}</strong>
        </span>
        <Icon name={open ? 'up' : 'down'} size={16} />
      </button>
      {open && (
        <div className="card install-steps" id="install-steps">
          <p className="small">{t('install.ios.why')}</p>
          <ol className="small">
            <li>{t('install.ios.step1')}</li>
            <li>{t('install.ios.step2')}</li>
            <li>{t('install.ios.step3')}</li>
          </ol>
          <p className="muted small">
            {t('install.ios.move')} <a href={href('settings', 'backup')}>{t('install.ios.backup')}</a>
          </p>
        </div>
      )}
    </div>
  );
}
