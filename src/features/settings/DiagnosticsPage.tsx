import { useState } from 'react';
import { useToast } from '../../app/toast';
import { clearDiag, diagEntries } from '../../app/diagnostics';
import { t } from '../../i18n';
import { SubPage } from './ProfilePage';

/** Device-local log for problems that cannot be reproduced elsewhere. */
export function DiagnosticsPage() {
  const toast = useToast();
  const [entries, setEntries] = useState(diagEntries);
  const text = entries
    .map(({ t: time, e, ...rest }) => `${new Date(time).toISOString().slice(11, 23)} ${e} ${Object.keys(rest).length ? JSON.stringify(rest) : ''}`)
    .join('\n');

  return (
    <SubPage title={t('diag.title')}>
      <p className="muted small">{t('diag.intro')}</p>
      <div className="row wrap">
        <button
          className="btn btn-primary"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(`ToFoo ${__APP_VERSION__}\n${text}`)
              .then(() => toast(t('diag.copied')))
              .catch(() => toast(t('diag.copyFailed')))
          }
        >
          {t('error.copy')}
        </button>
        <button className="btn btn-ghost" onClick={() => setEntries(diagEntries())}>
          {t('diag.refresh')}
        </button>
        <button
          className="btn btn-danger-ghost"
          onClick={() => {
            clearDiag();
            setEntries([]);
          }}
        >
          {t('diag.clear')}
        </button>
      </div>

      <h2 className="section-title">{t('diag.log', { n: entries.length })}</h2>
      <pre className="error-details small">{text || t('diag.empty')}</pre>
    </SubPage>
  );
}
