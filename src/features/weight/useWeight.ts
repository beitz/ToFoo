import { useMemo } from 'react';
import { useData } from '../../app/data';
import { logCheck, weightTrend, type LogCheck, type TrendPoint } from '../../logic/weight';
import { PROFILE_DEFAULTS } from '../../model/requirements';

/** The weight trend and the log check, from the profile's weigh-ins and the model's days. */
export function useWeight(): { points: TrendPoint[]; check: LogCheck } {
  const d = useData();
  const p = d.profile;
  const points = useMemo(() => weightTrend(p.weightHistory), [p.weightHistory]);
  const check = useMemo(
    () =>
      logCheck({
        history: p.weightHistory,
        days: d.modelDays,
        daily: d.model.daily,
        dayStatus: d.model.dayStatus,
        today: d.today,
        sex: p.sex,
        ageYears: p.birthYear ? Number(d.today.slice(0, 4)) - p.birthYear : undefined,
        activity: p.activity ?? PROFILE_DEFAULTS.activity,
      }),
    [p.weightHistory, p.sex, p.birthYear, p.activity, d.modelDays, d.model, d.today],
  );
  return { points, check };
}
