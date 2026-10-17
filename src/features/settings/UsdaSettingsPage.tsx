import { useEffect, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { getUsdaKey, setUsdaKey } from '../../foods/findProduct';
import { USDA_KEY_SIGNUP } from '../../foods/usda';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Field, Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';

/** Turn USDA FoodData Central on and, optionally, enter an own api.data.gov key (stored on this device only). */
export function UsdaSettingsPage() {
  const d = useData();
  const toast = useToast();
  const on = isOn(d.settings.features, 'usda');
  const [saved, setSaved] = useState<string>();
  const [draft, setDraft] = useState('');
  useEffect(() => {
    void getUsdaKey().then(setSaved);
  }, []);

  async function saveKey(key: string) {
    await setUsdaKey(key);
    setSaved(key.trim());
    setDraft('');
    toast(t(key.trim() ? 'usda.keySaved' : 'usda.keyRemoved'));
  }

  return (
    <section>
      <header className="page-head row">
        <a className="icon-btn" href={href('settings')} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{t('usda.heading')}</h1>
      </header>
      <p>{t('usda.settingsIntro')}</p>

      <div className="card">
        <Toggle checked={on} onChange={(v) => repo.updateSettings({ features: { ...d.settings.features, usda: v } })} label={t('usda.enable')} />
        <p className="muted small">{t('usda.settingsPrivacy')}</p>
      </div>

      <h2 className="section-title">{t('usda.key')}</h2>
      <div className="card">
        {saved ? (
          <div className="row-between">
            <span>
              {t('usda.keyIsSet')} <span className="muted">…{saved.slice(-4)}</span>
            </span>
            <button className="btn btn-small btn-danger-ghost" onClick={() => void saveKey('')}>
              {t('ai.removeKey')}
            </button>
          </div>
        ) : (
          <>
            <p className="small">{t('usda.usingDemo')}</p>
            <Field label={t('usda.key')} hint={t('usda.keyHint')}>
              {(id) => <input id={id} type="password" autoComplete="off" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />}
            </Field>
            <button className="btn btn-primary" disabled={!draft.trim()} onClick={() => void saveKey(draft)}>
              {t('common.save')}
            </button>
          </>
        )}
        <p className="muted small">
          {t('usda.getKey')}{' '}
          <a href={USDA_KEY_SIGNUP} target="_blank" rel="noreferrer noopener">
            fdc.nal.usda.gov
          </a>
        </p>
      </div>
    </section>
  );
}
