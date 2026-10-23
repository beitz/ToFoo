import { useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import type { ActivityLevel, Sex } from '../../model/paramTypes';
import { repo } from '../../storage/repo';
import { Field, NumberInput, Segmented } from '../../ui/controls';
import { AccentPicker } from '../settings/AccentPicker';
import { isAppleBrowserTab } from '../../lib/platform';
import { Icon } from '../../ui/Icon';

/**
 * First launch (docs/SPEC.md "First launch and guided tours"): a small sheet over Home, so the app
 * stays in view while the user picks a look, then a few optional details with one line each on why
 * they help. No questions beyond that; the Home tour follows. Stores start at Average.
 */
export function FirstLaunch() {
  const [step, setStep] = useState<'look' | 'about'>('look');
  return (
    <div className="first-launch" role="dialog" aria-modal="true" aria-labelledby="first-launch-title">
      <div className="first-launch-sheet">{step === 'look' ? <LookStep onDone={() => setStep('about')} /> : <AboutStep />}</div>
    </div>
  );
}

function LookStep({ onDone }: { onDone: () => void }) {
  const { settings } = useData();
  return (
    <>
      <h2 id="first-launch-title">{t('onboarding.title')}</h2>
      <p className="muted small">{t('onboarding.welcome')}</p>
      {isAppleBrowserTab() && (
        <p className="notice small">
          <Icon name="warning" size={16} /> {t('install.ios.onboarding')}
        </p>
      )}
      <p className="muted small settings-label" id="accent-label">
        {t('settings.accent')}
      </p>
      <AccentPicker />
      <p className="muted small settings-label">{t('settings.theme')}</p>
      <Segmented
        label={t('settings.theme')}
        value={settings.theme}
        onChange={(v) => repo.updateSettings({ theme: v })}
        options={[
          { value: 'system', label: t('settings.themeSystem') },
          { value: 'light', label: t('settings.themeLight') },
          { value: 'dark', label: t('settings.themeDark') },
        ]}
      />
      <p className="muted small">{t('onboarding.lookLater')}</p>
      <div className="sheet-actions">
        <button type="button" className="btn btn-primary" onClick={onDone}>
          {t('onboarding.done')}
        </button>
      </div>
    </>
  );
}

/** Kept on the sheet until Continue, so Skip really leaves everything at the defaults. */
function AboutStep() {
  const d = useData();
  const [birthYear, setBirthYear] = useState<number>();
  const [sex, setSex] = useState<Sex>();
  const [weight, setWeight] = useState<number>();
  const [activity, setActivity] = useState<ActivityLevel>();

  const finish = (save: boolean) =>
    repo.updateProfile({
      onboarded: true,
      startingLevel: 'average',
      ...(save && {
        birthYear: birthYear && birthYear > 1900 ? Math.round(birthYear) : undefined,
        sex,
        activity,
        weightHistory: weight ? [{ day: d.today, kg: weight }] : [],
      }),
    });

  return (
    <>
      <h2 id="first-launch-title">{t('onboarding.aboutTitle')}</h2>
      <p className="muted small">{t('onboarding.aboutIntro')}</p>
      <Field label={t('profile.birthYear')} hint={t('profile.birthYearHint', { group: d.requirements.ageGroup })}>
        {(id) => <NumberInput id={id} value={birthYear} onChange={setBirthYear} placeholder="—" min={1900} />}
      </Field>
      <div className="field">
        <span className="field-label">{t('profile.sex')}</span>
        <Segmented
          label={t('profile.sex')}
          value={sex ?? 'unset'}
          onChange={(v) => setSex(v === 'unset' ? undefined : v)}
          options={[
            { value: 'unset', label: t('profile.notSet') },
            { value: 'female', label: t('profile.female') },
            { value: 'male', label: t('profile.male') },
          ]}
        />
        <div className="field-hint">{t('profile.sexHint')}</div>
      </div>
      <Field label={t('profile.weight')} hint={t('profile.weightWhy')}>
        {(id) => <NumberInput id={id} value={weight} onChange={setWeight} suffix="kg" min={20} placeholder="—" />}
      </Field>
      <div className="field">
        <span className="field-label">{t('profile.activity')}</span>
        <Segmented
          label={t('profile.activity')}
          value={activity ?? 'medium'}
          onChange={setActivity}
          options={[
            { value: 'low', label: t('profile.activityLow') },
            { value: 'medium', label: t('profile.activityMedium') },
            { value: 'high', label: t('profile.activityHigh') },
          ]}
        />
        <div className="field-hint">{t('profile.activityHint')}</div>
      </div>
      <p className="muted small">{t('onboarding.aboutLater')}</p>
      <div className="sheet-actions">
        <button type="button" className="btn btn-ghost" onClick={() => void finish(false)}>
          {t('onboarding.skip')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void finish(true)}>
          {t('onboarding.continue')}
        </button>
      </div>
    </>
  );
}
