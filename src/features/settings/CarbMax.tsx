import { useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { fmtAmount, fmtNumber } from '../../lib/format';
import type { OwnTarget, Requirement } from '../../model/requirements';
import { ketogenicCarbs } from '../../../model/parameters';
import { repo } from '../../storage/repo';
import { Field, NumberInput, Segmented } from '../../ui/controls';

const ID = 'CHO';

/** One sentence: whether an own carbohydrate maximum is in use. */
export function carbBasisText(req: Requirement | undefined): string {
  return req?.own ? t('carbs.inUseMax', { g: fmtAmount(ID, req.recommended) }) : t('carbs.inUseNone');
}

/** Profile card: no carbohydrate limit (amount only, the default), or the user's own maximum per day. */
export function CarbMaxCard() {
  const d = useData();
  const req = d.requirements.byNutrient.get(ID);
  const own = d.profile.nutrientTargets?.[ID];
  // Local so that clearing the number field doesn't flip the choice back to "No maximum".
  const [mode, setMode] = useState<'none' | 'max'>(own ? 'max' : 'none');
  const keto = ketogenicCarbs.value;

  const update = (target: OwnTarget | undefined) => {
    const next = { ...d.profile.nutrientTargets };
    if (target) next[ID] = target;
    else delete next[ID];
    return repo.updateProfile({ nutrientTargets: Object.keys(next).length ? next : undefined });
  };

  return (
    <div className="card">
      <p>{carbBasisText(req)}</p>
      <div className="field">
        <span className="field-label">{t('carbs.target')}</span>
        <Segmented
          label={t('carbs.target')}
          value={mode}
          onChange={(m) => {
            setMode(m);
            // Start at the upper end of the ketogenic range, so it is edited rather than typed from scratch.
            void update(m === 'max' ? (own ?? { amount: keto.high, per: 'day' }) : undefined);
          }}
          options={[
            { value: 'none', label: t('carbs.none') },
            { value: 'max', label: t('carbs.own') },
          ]}
        />
      </div>
      {mode === 'max' && (
        <>
          <Field label={t('carbs.ownLabel')}>
            {(id) => (
              <NumberInput
                id={id}
                value={own?.amount}
                onChange={(v) => void update(v && v > 0 ? { amount: Math.round(v), per: 'day' } : undefined)}
                suffix="g"
                min={0}
                placeholder={String(keto.high)}
              />
            )}
          </Field>
          <div className="chips" role="group" aria-label={t('carbs.presets')}>
            {[keto.low, keto.high].map((v) => (
              <button key={v} className={`chip${own?.amount === v ? ' on' : ''}`} aria-pressed={own?.amount === v} onClick={() => void update({ amount: v, per: 'day' })}>
                {t('carbs.preset', { g: fmtNumber(v) })}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="small muted">
        {t('carbs.research', { low: fmtNumber(keto.low), high: fmtNumber(keto.high) })}{' '}
        <a href={ketogenicCarbs.url} target="_blank" rel="noreferrer">
          {t('carbs.sourceLink')}
        </a>
      </p>
      <p className="small muted">{t('carbs.howShown', { days: d.settings.shortWindowDays })}</p>
    </div>
  );
}
