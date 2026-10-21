import { useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { fmtAmount, fmtNumber } from '../../lib/format';
import { currentWeight } from '../../logic/resolve';
import { PROFILE_DEFAULTS, type OwnTarget, type Requirement } from '../../model/requirements';
import { proteinForTraining } from '../../../model/parameters';
import { repo } from '../../storage/repo';
import { Field, NumberInput, Segmented } from '../../ui/controls';

const ID = 'PROT625';
type Mode = 'reference' | OwnTarget['per'];

const perKg = (v: number) => fmtNumber(v, 1);
/** Research values keep their published precision ("2.0", not "2"). */
const cited = (v: number) => v.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** One sentence: which protein target is in use and where it comes from. */
export function proteinBasisText(req: Requirement, weightKg: number): string {
  const g = fmtAmount(ID, req.recommended);
  const kg = fmtNumber(weightKg, 1);
  if (!req.own) return t('protein.inUseReference', { g, perKg: perKg(req.recommended / weightKg), kg });
  if (req.own.target.per === 'kg') return t('protein.inUseOwnKg', { g, perKg: perKg(req.own.target.amount), kg });
  return t('protein.inUseOwnDay', { g });
}

/** Profile card: the DGE protein reference intake, or the user's own target per kg or per day. */
export function ProteinTargetCard() {
  const d = useData();
  const req = d.requirements.byNutrient.get(ID);
  const own = d.profile.nutrientTargets?.[ID];
  // Local so that clearing the number field doesn't flip the choice back to "DGE".
  const [mode, setMode] = useState<Mode>(own?.per ?? 'reference');
  if (!req) return null;
  const weightKg = currentWeight(d.profile) ?? PROFILE_DEFAULTS.weightKg;
  const referenceG = req.own?.referenceRecommended ?? req.recommended;

  const update = (target: OwnTarget | undefined) => {
    const next = { ...d.profile.nutrientTargets };
    if (target) next[ID] = target;
    else delete next[ID];
    return repo.updateProfile({ nutrientTargets: Object.keys(next).length ? next : undefined });
  };
  // Switching keeps the amount in use, so the own target is edited rather than typed from scratch.
  const switchTo = (m: Mode) => {
    setMode(m);
    if (m === 'reference') void update(undefined);
    else if (m === 'kg') void update({ amount: Math.round((req.recommended / weightKg) * 10) / 10, per: 'kg' });
    else void update({ amount: Math.round(req.recommended), per: 'day' });
  };

  const gain = proteinForTraining.muscleGain;
  const ex = proteinForTraining.exercising.value;
  const deficit = proteinForTraining.energyDeficit.value;
  const presets = [gain.value.central, gain.value.high].map((v) => Math.round(v * 10) / 10);

  return (
    <div className="card">
      <p>{proteinBasisText(req, weightKg)}</p>
      <div className="field">
        <span className="field-label">{t('protein.target')}</span>
        <Segmented
          label={t('protein.target')}
          value={mode}
          onChange={switchTo}
          options={[
            { value: 'reference', label: t('protein.reference') },
            { value: 'kg', label: t('protein.perKg') },
            { value: 'day', label: t('protein.perDay') },
          ]}
        />
      </div>
      {mode === 'kg' && (
        <>
          <Field label={t('protein.ownKgLabel')} hint={t('protein.referenceHint', { g: fmtAmount(ID, referenceG), perKg: perKg(referenceG / weightKg) })}>
            {(id) => (
              <NumberInput
                id={id}
                value={own?.per === 'kg' ? own.amount : undefined}
                onChange={(v) => void update(v && v > 0 ? { amount: Math.round(v * 100) / 100, per: 'kg' } : undefined)}
                suffix={t('protein.gPerKg')}
                min={0}
                placeholder={perKg(referenceG / weightKg)}
              />
            )}
          </Field>
          <div className="chips" role="group" aria-label={t('protein.presets')}>
            {presets.map((v) => (
              <button key={v} className={`chip${own?.per === 'kg' && own.amount === v ? ' on' : ''}`} aria-pressed={own?.per === 'kg' && own.amount === v} onClick={() => void update({ amount: v, per: 'kg' })}>
                {t('protein.preset', { perKg: perKg(v) })}
              </button>
            ))}
          </div>
          {d.requirements.defaultsUsed.includes('weight') && <p className="small notice">{t('protein.weightDefault', { kg: fmtNumber(weightKg) })}</p>}
        </>
      )}
      {mode === 'day' && (
        <Field label={t('protein.ownDayLabel')} hint={t('protein.referenceHint', { g: fmtAmount(ID, referenceG), perKg: perKg(referenceG / weightKg) })}>
          {(id) => (
            <NumberInput
              id={id}
              value={own?.per === 'day' ? own.amount : undefined}
              onChange={(v) => void update(v && v > 0 ? { amount: Math.round(v), per: 'day' } : undefined)}
              suffix="g"
              min={0}
              placeholder={String(Math.round(referenceG))}
            />
          )}
        </Field>
      )}
      <p className="small muted">
        {t('protein.research', {
          gain: cited(gain.value.central),
          low: cited(gain.value.low),
          high: cited(gain.value.high),
          exLow: cited(ex.low),
          exHigh: cited(ex.high),
          defLow: cited(deficit.low),
          defHigh: cited(deficit.high),
        })}{' '}
        <a href={gain.url} target="_blank" rel="noreferrer">
          {t('protein.sourceMorton')}
        </a>
        {' · '}
        <a href={proteinForTraining.exercising.url} target="_blank" rel="noreferrer">
          {t('protein.sourceIssn')}
        </a>
      </p>
      <p className="small muted">{t('protein.alsoUsed')}</p>
    </div>
  );
}
