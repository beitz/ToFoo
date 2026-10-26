import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { formatDay } from '../../lib/dates';
import { t } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import type { EnergyTarget } from '../../model/requirements';
import { energyNeed } from '../../../model/parameters';
import { repo } from '../../storage/repo';
import { Field, NumberInput, Segmented } from '../../ui/controls';

const kcal = (v: number) => fmtNumber(v);

/** One sentence: which energy target is in use and where it comes from. */
export function energyBasisText(e: EnergyTarget): string {
  if (e.basis === 'own') return t('energy.inUseOwn', { kcal: kcal(e.kcal) });
  if (e.basis === 'estimate') return t('energy.inUseEstimate', { kcal: kcal(e.kcal) });
  return t('energy.inUseGuide', { kcal: kcal(e.kcal) });
}

/** Profile card: the estimated energy need, or the user's own target. */
export function EnergyTargetCard() {
  const d = useData();
  const e = d.requirements.energy;
  // Local so that clearing the number field doesn't flip the choice back to "Estimate".
  const [mode, setMode] = useState<'estimate' | 'own'>(d.profile.energyTargetKcal ? 'own' : 'estimate');
  const update = (energyTargetKcal: number | undefined) => repo.updateProfile({ energyTargetKcal });
  const fallback = e.estimate?.kcal ?? e.guideKcal;

  return (
    <div className="card">
      <p>{energyBasisText(e)}</p>
      <div className="field">
        <span className="field-label">{t('energy.target')}</span>
        <Segmented
          label={t('energy.target')}
          value={mode}
          onChange={(v) => {
            setMode(v);
            // Start the own target at the current estimate, so it is edited rather than typed from scratch.
            void update(v === 'own' ? (d.profile.energyTargetKcal ?? fallback) : undefined);
          }}
          options={[
            { value: 'estimate', label: t('energy.estimate') },
            { value: 'own', label: t('energy.own') },
          ]}
        />
      </div>
      {mode === 'own' && (
        <Field label={t('energy.ownLabel')} hint={e.estimate ? t('energy.ownHintEstimate', { kcal: kcal(e.estimate.kcal) }) : t('energy.ownHintGuide', { kcal: kcal(e.guideKcal) })}>
          {(id) => <NumberInput id={id} value={d.profile.energyTargetKcal} onChange={(v) => void update(v && Math.round(v))} suffix="kcal" min={500} placeholder={String(fallback)} />}
        </Field>
      )}
      <p className="small muted">
        {e.estimate
          ? e.estimate.factor !== 1
            ? t('energy.howEstimateCorrected', {
                ree: kcal(e.estimate.reeKcal),
                pal: fmtNumber(e.estimate.pal, 1),
                factor: fmtNumber(e.estimate.factor, 2),
                kcal: kcal(e.estimate.kcal),
                guide: kcal(e.guideKcal),
                plain: kcal(Math.round((e.estimate.reeKcal * e.estimate.pal) / 10) * 10),
              })
            : t('energy.howEstimate', { ree: kcal(e.estimate.reeKcal), pal: fmtNumber(e.estimate.pal, 1), kcal: kcal(e.estimate.kcal), guide: kcal(e.guideKcal) })
          : t('energy.howGuide')}{' '}
        <a href={energyNeed.ree.url} target="_blank" rel="noreferrer">
          {t('energy.sourceLink')}
        </a>
      </p>
      {d.profile.energyCorrection && <CorrectionLine />}
      <p className="small muted">{t('energy.alsoUsed')}</p>
    </div>
  );
}

/** The correction accepted on the Weight page, with a way back. */
function CorrectionLine() {
  const d = useData();
  const toast = useToast();
  const c = d.profile.energyCorrection!;
  return (
    <div className="energy-correction">
      <p className="small">{t('energy.corrected', { day: formatDay(c.day, d.today), factor: fmtNumber(c.factor, 2) })}</p>
      <button
        className="btn btn-small btn-ghost"
        onClick={async () => {
          await repo.updateProfile({ energyCorrection: undefined });
          toast(t('energy.correctionRemoved'), () => repo.updateProfile({ energyCorrection: c }));
        }}
      >
        {t('energy.correctionRemove')}
      </button>
    </div>
  );
}
