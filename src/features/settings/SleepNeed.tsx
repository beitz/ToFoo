import { useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import { sleepNeed } from '../../../model/parameters';
import { repo } from '../../storage/repo';
import { Field, NumberInput, Segmented } from '../../ui/controls';
import { hmText } from '../sleep/format';

/** The sleep need in minutes a night: the user's own, else the recommendation. */
export function useSleepNeed(): { minutes: number; own: boolean } {
  const own = useData().profile.sleepNeedMinutes;
  return own ? { minutes: own, own: true } : { minutes: sleepNeed.hours.value * 60, own: false };
}

/** Profile card: how much sleep a night counts as enough, the recommendation or the user's own. */
export function SleepNeedCard() {
  const d = useData();
  const need = useSleepNeed();
  const recommended = sleepNeed.hours.value * 60;
  // Local so that clearing the number field doesn't flip the choice back.
  const [mode, setMode] = useState<'recommended' | 'own'>(need.own ? 'own' : 'recommended');
  const update = (sleepNeedMinutes: number | undefined) => repo.updateProfile({ sleepNeedMinutes });
  const hours = d.profile.sleepNeedMinutes ? d.profile.sleepNeedMinutes / 60 : undefined;
  return (
    <div className="card">
      <p>{t(need.own ? 'sleepNeed.inUseOwn' : 'sleepNeed.inUse', { need: hmText(need.minutes) })}</p>
      <div className="field">
        <span className="field-label">{t('sleepNeed.label')}</span>
        <Segmented
          label={t('sleepNeed.label')}
          value={mode}
          onChange={(v) => {
            setMode(v);
            void update(v === 'own' ? (d.profile.sleepNeedMinutes ?? recommended) : undefined);
          }}
          options={[
            { value: 'recommended', label: t('sleepNeed.recommended', { need: hmText(recommended) }) },
            { value: 'own', label: t('sleepNeed.own') },
          ]}
        />
      </div>
      {mode === 'own' && (
        <Field label={t('sleepNeed.ownLabel')} hint={t('sleepNeed.ownHint')}>
          {(id) => <NumberInput id={id} value={hours} onChange={(v) => void update(v && v > 0 && v <= 24 ? Math.round(v * 60) : undefined)} suffix="h" min={1} placeholder="7.5" />}
        </Field>
      )}
      <p className="small muted">
        {t('sleepNeed.how')}{' '}
        <a href={sleepNeed.hours.url} target="_blank" rel="noreferrer">
          {t('sleepNeed.sourceLink')}
        </a>
      </p>
    </div>
  );
}
