import { isUnsure, type GaugeStatus, type StatusSpan } from '../model/simulate';
import { t, type MessageKey } from '../i18n';
import { Icon } from './Icon';

export const STATUS_ICON: Record<GaugeStatus, string> = {
  fine: 'check',
  gettingLow: 'down',
  low: 'alert',
  tooHigh: 'up',
  unknown: 'question',
  info: 'info',
};

export function statusLabel(s: GaugeStatus): string {
  return t(`status.${s}` as MessageKey);
}

/** The icon for a status, or the circled wave when the likely range crosses a status line. */
export function statusIconOf(s: GaugeStatus, span: StatusSpan | undefined): string {
  return isUnsure(span) ? 'unsure' : STATUS_ICON[s];
}

/** "Low", or "Unclear: low to enough" when the likely range crosses a status line. */
export function statusText(s: GaugeStatus, span: StatusSpan | undefined): string {
  if (!span || !isUnsure(span)) return statusLabel(s);
  const word = (x: GaugeStatus) => t(`statusWord.${x}` as MessageKey);
  return t('status.unclear', { from: word(span.low), to: word(span.high) });
}

/** Status is never shown by colour alone: icon + label. */
export function StatusBadge({ status, compact = false }: { status: GaugeStatus; compact?: boolean }) {
  return (
    <span className={`status status-${status}`}>
      <Icon name={STATUS_ICON[status]} size={compact ? 14 : 16} />
      <span className={compact ? 'status-text-compact' : undefined}>{statusLabel(status)}</span>
    </span>
  );
}

/** Lower = more urgent. */
export function urgencyRank(s: GaugeStatus): number {
  return { tooHigh: 0, low: 1, gettingLow: 2, fine: 3, unknown: 4, info: 5 }[s];
}
