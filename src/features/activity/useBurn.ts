import { useData } from '../../app/data';
import { t } from '../../i18n';
import { activityEnergyOf, type BurnBase } from '../../logic/energyBurn';
import { isOn } from '../../settings/features';
import type { ActivityRecord } from '../../storage/types';
import { fmtKcal10 } from '../weight/format';

/**
 * The base day activities are counted against, while their energy counts (Activity and "Energy from
 * activities" on): the personal estimate (with the weight correction), else the DGE guide value.
 */
export function useBurnBase(): BurnBase | undefined {
  const d = useData();
  const f = d.settings.features;
  if (!isOn(f, 'activity') || !isOn(f, 'activityEnergy')) return undefined;
  const e = d.requirements.energy;
  return { kcalPerDay: e.estimate?.kcal ?? e.guideKcal, weightKg: d.weightKg };
}

/** "+300 kcal" for an activity while activity energy counts; undefined when off or its energy is unknown. */
export function useAddsText(): (a: Pick<ActivityRecord, 'kind' | 'intensity' | 'compendium' | 'minutes'>) => string | undefined {
  const base = useBurnBase();
  return (a) => {
    const e = base && a.minutes > 0 ? activityEnergyOf(a, base.weightKg, base.kcalPerDay) : undefined;
    return e ? t('activity.addsShort', { kcal: fmtKcal10(e.extraKcal) }) : undefined;
  };
}
