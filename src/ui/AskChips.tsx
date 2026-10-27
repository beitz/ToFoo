import { useEffect, useState } from 'react';
import { useData } from '../app/data';
import { setAsk, type AskData } from '../app/ask';
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
 * (or Patterns, for questions about what goes together) with the question already typed. The user
 * still presses Send, so a tap never costs anything. Hidden with the "Question shortcuts" setting off.
 * Without the assistant or its API key they stay and lead to setting it up (owner's ask, 2026-10-23).
 */
export function AskChips({ questions, to = 'assistant', className, tour, data }: { questions: string[]; to?: 'assistant' | 'insights'; className?: string; tour?: string; data?: AskData }) {
  const d = useData();
  const assistant = isOn(d.settings.features, 'aiAssistant');
  const hasKey = useHasApiKey(assistant);
  if (!isOn(d.settings.features, 'questionShortcuts') || questions.length === 0) return null;
  // Still reading whether a key is set: nothing yet, rather than a chip that changes what it does.
  if (assistant && hasKey === undefined) return null;
  const ready = assistant && hasKey;
  return (
    <div className={className ? `ask-chips ${className}` : 'ask-chips'} role="group" aria-label={t('ask.label')} data-tour={tour}>
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          className="ask-chip"
          onClick={() => {
            if (!ready) return navigate('settings', 'assistant', 'key');
            setAsk(q, data);
            navigate(to);
          }}
        >
          <Icon name="chat" size={16} />
          {q}
        </button>
      ))}
    </div>
  );
}


/**
 * A way into the assistant or Patterns that sends data once used, drawn like the question chips
 * (dashed, round) so everything that leads to the AI looks the same (owner's ask, 2026-10-23):
 * full width, a title, an optional line under it, and a chevron.
 */
export function AskLink({ to, icon, title, sub, tour }: { to: string; icon: string; title: string; sub?: string; tour?: string }) {
  return (
    <a className="ask-chip ask-link" href={to} data-tour={tour}>
      <Icon name={icon} size={20} />
      <span className="grow ask-link-text">
        <span>{title}</span>
        {sub && <span className="small muted">{sub}</span>}
      </span>
      <Icon name="chevron" size={16} />
    </a>
  );
}
