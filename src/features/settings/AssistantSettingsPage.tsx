import { useEffect, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { AI_MODELS, DEFAULT_AI_MODEL, type AiModel } from '../../ai/assistant';
import { getAiSettings, getUsage, setAiModel, setApiKey } from '../../ai/client';
import { PRICES_AS_OF, summarize, type UsageDay } from '../../ai/pricing';
import { getOpenAiKey, setOpenAiKey } from '../../ai/transcribe';
import { addDays } from '../../lib/dates';
import { fmtNumber, fmtTokens, fmtUsd } from '../../lib/format';
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
  const [usage, setUsage] = useState<UsageDay[]>();
  useEffect(() => {
    void getAiSettings().then(setSaved);
    void getUsage().then(setUsage);
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

      <h2 className="section-title">{t('ai.productsTitle')}</h2>
      <div className="card">
        <Toggle
          checked={isOn(d.settings.features, 'productWebSearch')}
          onChange={(v) => repo.updateSettings({ features: { ...d.settings.features, productWebSearch: v } })}
          label={t('ai.webSearch')}
        />
        <p className="muted small">{t('ai.webSearchHint')}</p>
        {!isOn(d.settings.features, 'openFoodFacts') && <p className="muted small">{t('ai.webSearchNeedsOff')}</p>}
      </div>

      <h2 className="section-title">{t('insights.settingsTitle')}</h2>
      <div className="card">
        <Toggle checked={isOn(d.settings.features, 'insights')} onChange={(v) => repo.updateSettings({ features: { ...d.settings.features, insights: v } })} label={t('insights.enable')} />
        <p className="muted small">{t('insights.privacy')}</p>
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

      <VoiceSettings />

      <h2 className="section-title">{t('ai.usageTitle')}</h2>
      <div className="card">
        {usage && usage.length > 0 ? (
          <table className="usage-table">
            <tbody>
              {(
                [
                  ['ai.usageToday', d.today],
                  ['ai.usage30', addDays(d.today, -29)],
                  ['ai.usageAll', undefined],
                ] as const
              ).map(([label, from]) => {
                const s = summarize(usage, saved?.model ?? DEFAULT_AI_MODEL, from);
                return (
                  <tr key={label}>
                    <th scope="row">{t(label)}</th>
                    <td>
                      <strong>{fmtUsd(s.usd)}</strong>
                      <span className="muted small block">{t('ai.usageDetail', { requests: fmtNumber(s.requests), tokens: fmtTokens(s.tokens) })}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('ai.usageNone')}</p>
        )}
        <p className="muted small">{t('ai.usageNote', { date: PRICES_AS_OF })}</p>
      </div>
    </section>
  );
}

/** Voice input: its own toggle and OpenAI key, kept on this phone like the Anthropic key. */
function VoiceSettings() {
  const d = useData();
  const toast = useToast();
  const on = isOn(d.settings.features, 'voiceInput');
  const [key, setKey] = useState<string>();
  const [draft, setDraft] = useState('');
  useEffect(() => {
    void getOpenAiKey().then(setKey);
  }, []);

  async function save(value: string) {
    await setOpenAiKey(value);
    setKey(value.trim());
    setDraft('');
    toast(t(value.trim() ? 'ai.keySaved' : 'ai.keyRemoved'));
  }

  return (
    <>
      <h2 className="section-title">{t('voice.title')}</h2>
      <div className="card">
        <p className="small">{t('voice.intro')}</p>
        <Toggle checked={on} onChange={(v) => repo.updateSettings({ features: { ...d.settings.features, voiceInput: v } })} label={t('voice.enable')} />
        <p className="muted small">{t('voice.privacy')}</p>
        {on &&
          (key ? (
            <div className="row-between">
              <span>
                {t('ai.keyIsSet')} <span className="muted">…{key.slice(-4)}</span>
              </span>
              <button className="btn btn-small btn-danger-ghost" onClick={() => void save('')}>
                {t('ai.removeKey')}
              </button>
            </div>
          ) : (
            <>
              <p className="muted small">{t('voice.needsKey')}</p>
              <Field label={t('voice.key')} hint={t('ai.keyHint')}>
                {(id) => <input id={id} type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={draft} onChange={(e) => setDraft(e.target.value)} />}
              </Field>
              <button className="btn btn-primary" disabled={!draft.trim()} onClick={() => void save(draft)}>
                {t('common.save')}
              </button>
              <p className="muted small">
                {t('voice.getKey')}{' '}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer noopener">
                  platform.openai.com
                </a>
              </p>
            </>
          ))}
      </div>
    </>
  );
}
