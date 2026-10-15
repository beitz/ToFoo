import { useState } from 'react';
import { useToast } from '../../app/toast';
import { clearDiag, diagEntries, diagFlags, setDiagFlags, type DiagFlags } from '../../app/diagnostics';
import { t } from '../../i18n';
import { Toggle } from '../../ui/controls';
import { SubPage } from './ProfilePage';

/** Device-local log and experiments for problems that cannot be reproduced elsewhere. */
export function DiagnosticsPage() {
  const toast = useToast();
  const [entries, setEntries] = useState(diagEntries);
  const [flags, setFlags] = useState<DiagFlags>(diagFlags);
  const text = entries
    .map(({ t: time, e, ...rest }) => `${new Date(time).toISOString().slice(11, 23)} ${e} ${Object.keys(rest).length ? JSON.stringify(rest) : ''}`)
    .join('\n');
  const update = (patch: DiagFlags) => {
    const next = { ...flags, ...patch };
    setDiagFlags(next);
    setFlags(next);
  };

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

      <h2 className="section-title">{t('diag.experiments')}</h2>
      <div className="card">
        <Toggle checked={!!flags.repaint} onChange={(v) => update({ repaint: v })} label={t('diag.repaint')} description={t('diag.repaintHint')} />
        <Toggle checked={!!flags.reloadOnNavigate} onChange={(v) => update({ reloadOnNavigate: v })} label={t('diag.reload')} description={t('diag.reloadHint')} />
      </div>

      <h2 className="section-title">{t('diag.log', { n: entries.length })}</h2>
      <pre className="error-details small">{text || t('diag.empty')}</pre>
    </SubPage>
  );
}
