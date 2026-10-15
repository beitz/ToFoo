import { t } from '../../i18n';
import { resolvePlan } from '../../storage/defaults';
import type { StoragePlan } from '../../storage/types';
import { NumberInput } from '../../ui/controls';

/** Fresh / fridge / freezer split. Freezer "rest" by default. */
export function PlanEditor({ plan, portions, onChange }: { plan: StoragePlan; portions: number; onChange: (p: StoragePlan) => void }) {
  const resolved = resolvePlan(plan, portions);
  return (
    <div className="plan">
      <div className="plan-row">
        <span>{t('plan.fresh')}</span>
        <NumberInput value={plan.fresh} onChange={(v) => onChange({ ...plan, fresh: Math.max(0, Math.round(v ?? 0)) })} min={0} />
      </div>
      <div className="plan-row">
        <span>{t('plan.fridge')}</span>
        <NumberInput value={plan.fridge} onChange={(v) => onChange({ ...plan, fridge: Math.max(0, Math.round(v ?? 0)) })} min={0} />
      </div>
      <div className="plan-row">
        <span>{t('plan.freezer')}</span>
        <span className="muted">{plan.freezer === null ? t('plan.rest', { n: resolved.freezer }) : resolved.freezer}</span>
      </div>
      <p className="muted small">{t('plan.hint')}</p>
    </div>
  );
}
