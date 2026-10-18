import { t } from '../../i18n';
import type { AiModel } from '../../ai/assistant';
import { modelTokensCost, totalTokens, type ModelTokens } from '../../ai/pricing';
import { fmtTokens, fmtUsd } from '../../lib/format';

/** What a chat has cost so far, and its latest message. */
export function UsageLine({ chat, turn, model }: { chat: ModelTokens; turn: ModelTokens; model: AiModel }) {
  const tokens = Object.values(chat).reduce((n, t) => n + totalTokens(t), 0);
  if (tokens === 0) return null;
  return (
    <p className="usage-line muted small">
      {t('ai.usageLine', { chat: fmtUsd(modelTokensCost(chat, model)), last: fmtUsd(modelTokensCost(turn, model)), tokens: fmtTokens(tokens) })}
    </p>
  );
}
