import { useEffect, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { AI_MODELS, type AiModel } from '../../ai/assistant';
import { getAiSettings, setAiModel, setApiKey } from '../../ai/client';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Field, Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';

const MODEL_LABEL: Record<AiModel, { name: string; detail: 'ai.model.opus' | 'ai.model.sonnet' | 'ai.model.haiku' }> = {
  'claude-opus-5-5': { name: 'Claude Opus 5.5', detail: 'ai.model.opus' },
  'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', detail: 'ai.model.sonnet' },
  'claude-haiku-5-5': { name: 'Claude Haiku 5.5', detail: 'ai.model.haiku' },
};

/** Turn the AI assistant on, enter the API key (stored on this device only) and pick a model. */
export function AssistantSettingsPage() {
  const d = useData();
  const toast = useToast();
  const on = isOn(d.settings.features, 'aiAssistant');
  const [saved, setSaved] = useState<{ apiKey: string; model: AiModel }>();
  const [draft, setDraft] = useState('');
  useEffect(() => {
    void getAiSettings().then(setSaved);
  }, []);

  async function saveKey(key: string) {
    await setApiKey(key);
    setSaved((s) => s && { ...s, apiKey: key.trim() });
    setDraft('');
    toast(t(key.trim() ? 'ai.keySaved' : 'ai.keyRemoved'));
  }

  return (
    <section>
      <header className="page-head row">
        <a className="icon-btn" href={href('settings')} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{t('ai.settingsTitle')}</h1>
      </header>
      <p>{t('ai.settingsIntro')}</p>

      <div className="card">
        <Toggle checked={on} onChange={(v) => repo.updateSettings({ features: { ...d.settings.features, aiAssistant: v } })} label={t('ai.enable')} />
        <p className="muted small">{t('ai.privacy')}</p>
      </div>

      <h2 className="section-title">{t('ai.key')}</h2>
      <div className="card">
        {saved?.apiKey ? (
          <div className="row-between">
            <span>
              {t('ai.keyIsSet')} <span className="muted">…{saved.apiKey.slice(-4)}</span>
            </span>
            <button className="btn btn-small btn-danger-ghost" onClick={() => void saveKey('')}>
              {t('ai.removeKey')}
            </button>
          </div>
        ) : (
          <>
            <Field label={t('ai.key')} hint={t('ai.keyHint')}>
              {(id) => <input id={id} type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={draft} onChange={(e) => setDraft(e.target.value)} />}
            </Field>
            <button className="btn btn-primary" disabled={!draft.trim()} onClick={() => void saveKey(draft)}>
              {t('common.save')}
            </button>
          </>
        )}
        <p className="muted small">
          {t('ai.getKey')}{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer noopener">
            console.anthropic.com
          </a>
        </p>
      </div>

      <h2 className="section-title">{t('ai.modelTitle')}</h2>
      <div className="card" role="radiogroup" aria-label={t('ai.modelTitle')}>
        {AI_MODELS.map((m) => (
          <label key={m} className="radio-row">
            <input
              type="radio"
              name="ai-model"
              checked={saved?.model === m}
              onChange={() => {
                void setAiModel(m);
                setSaved((s) => s && { ...s, model: m });
              }}
            />
            <span>
              {MODEL_LABEL[m].name}
              <span className="muted small block">{t(MODEL_LABEL[m].detail)}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
