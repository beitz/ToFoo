import type { DayStatus } from '../../model/types';

/** Icon per day status, so the calendar never relies on colour alone. */
export const DAY_ICON: Record<DayStatus | 'pending', string> = {
  logged: 'check',
  partial: 'half',
  fasted: 'moon',
  unknown: 'minus',
  pending: 'plus',
};
