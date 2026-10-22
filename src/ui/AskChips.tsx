import { useEffect, useState } from 'react';
import { useData } from '../app/data';
import { setAsk } from '../app/ask';
import { navigate } from '../app/router';
import { getAiSettings } from '../ai/client';
import { t } from '../i18n';
import { isOn } from '../settings/features';
import { Icon } from './Icon';

/** Whether an API key was set when last read: shown at once, then read again on every mount. */
let keyKnown: boolean | undefined;

/** Whether an API key is set; undefined until read. Only read when `on`. */
export function useHasApiKey(on: boolean): boolean | undefined {
  const [hasKey, setHasKey] = useState(keyKnown);
  useEffect(() => {
    if (!on) return;
    let live = true;
    void getAiSettings().then((ai) => {
      keyKnown = !!ai.apiKey;
      if (live) setHasKey(keyKnown);
    });
    return () => {
      live = false;
    };
  }, [on]);
  return hasKey;
}

/**
 * Question shortcuts (design 2026-10-22, "Q1 How am I doing?"): small chips that open the assistant
 * with the question already typed. The user still presses Send, so a tap never costs anything.
 * Hidden without the assistant, its API key or the "Question shortcuts" setting.
 */
export function AskChips({ questions }: { questions: string[] }) {
  const d = useData();
  const on = isOn(d.settings.features, 'aiAssistant') && isOn(d.settings.features, 'questionShortcuts');
  const hasKey = useHasApiKey(on);
  if (!on || !hasKey || questions.length === 0) return null;
  return (
    <div className="ask-chips" role="group" aria-label={t('ask.label')}>
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          className="ask-chip"
          onClick={() => {
            setAsk(q);
            navigate('assistant');
          }}
        >
          <Icon name="chat" size={16} />
          {q}
        </button>
      ))}
    </div>
  );
}

