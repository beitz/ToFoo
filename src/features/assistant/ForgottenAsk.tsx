import { useContext, useState } from 'react';
import type { Forgotten } from '../../ai/tools';
import { t, type MessageKey } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { CardFrame } from './CardFrame';

const LABEL: Record<Forgotten, MessageKey> = {
  cooking_fat: 'ai.forgotten.cooking_fat',
  spread: 'ai.forgotten.spread',
  sauce: 'ai.forgotten.sauce',
  drink: 'ai.forgotten.drink',
  milk_sugar: 'ai.forgotten.milk_sugar',
};

/**
 * Forgotten foods (docs/SPEC.md): one short question on a meal card about what logs most often miss.
 * A tap writes the answer into the chat box for the user to add how much and send (drawn as the
 * dashed AI chips, since it leads to the assistant); "That's all" folds the question away.
 */
export function ForgottenAsk({ asks }: { asks: readonly Forgotten[] }) {
  const { onAnswer } = useContext(CardFrame);
  const [picked, setPicked] = useState<ReadonlySet<Forgotten>>(new Set());
  const [done, setDone] = useState(false);
  if (!onAnswer || done) return null;
  return (
    <div className="forgotten-ask" role="group" aria-label={t('ai.forgotten.title')}>
      <span className="small">{t('ai.forgotten.title')}</span>
      <div className="ask-chips">
        {asks.map((f) => (
          <button
            key={f}
            type="button"
            className="ask-chip"
            aria-pressed={picked.has(f)}
            onClick={() => {
              onAnswer(t(LABEL[f]).toLowerCase());
              setPicked((p) => new Set(p).add(f));
            }}
          >
            {picked.has(f) && <Icon name="check" size={16} />}
            {t(LABEL[f])}
          </button>
        ))}
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setDone(true)}>
          {t('ai.forgotten.none')}
        </button>
      </div>
    </div>
  );
}
