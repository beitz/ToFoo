import type { BpPair } from '../../../model/blood-pressure';
import type { MessageKey } from '../../i18n';
import type { BpCategory } from '../../logic/bloodPressure';

/** "128/82": systolic over diastolic, whole mmHg. */
export const bpText = (p: BpPair) => `${Math.round(p.systolic)}/${Math.round(p.diastolic)}`;

/** The word for each category: status in words, never colour alone. */
export const BP_CATEGORY_KEY: Record<BpCategory, MessageKey> = {
  low: 'bp.cat.low',
  notRaised: 'bp.cat.notRaised',
  raised: 'bp.cat.raised',
  high: 'bp.cat.high',
  veryHigh: 'bp.cat.veryHigh',
};
