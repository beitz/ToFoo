import type { GaugeStatus } from '../model/simulate';
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
