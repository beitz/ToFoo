import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { currentWeight } from '../../logic/resolve';
import { repo } from '../../storage/repo';
import type { Profile } from '../../storage/types';
import { Field, NumberInput, Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { EnergyTargetCard } from './EnergyTarget';

export function SubPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <header className="page-head row">
        <a className="icon-btn" href={href('settings')} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{title}</h1>
      </header>
      {children}
    </section>
  );
}

export function ProfilePage() {
  const d = useData();
  const toast = useToast();
  const p = d.profile;
  const [newWeight, setNewWeight] = useState<number>();
  const update = (patch: Partial<Profile>) => repo.updateProfile(patch);
  const weight = currentWeight(p);
  const history = [...p.weightHistory].sort((a, b) => b.day.localeCompare(a.day));

  return (
    <SubPage title={t('settings.profile')}>
      <p className="muted small">{t('profile.intro')}</p>
      <div className="card">
        <Field label={t('profile.birthYear')} hint={t('profile.birthYearHint', { group: d.requirements.ageGroup })}>
          {(id) => <NumberInput id={id} value={p.birthYear} onChange={(v) => update({ birthYear: v && v > 1900 ? Math.round(v) : undefined })} placeholder="—" min={1900} />}
        </Field>
        <div className="field">
          <span className="field-label">{t('profile.sex')}</span>
          <Segmented
            label={t('profile.sex')}
            value={p.sex ?? 'unset'}
            onChange={(v) => update({ sex: v === 'unset' ? undefined : v })}
            options={[
              { value: 'unset', label: t('profile.notSet') },
              { value: 'female', label: t('profile.female') },
              { value: 'male', label: t('profile.male') },
            ]}
          />
          <div className="field-hint">{t('profile.sexHint')}</div>
        </div>
        {p.sex !== 'male' && (
          <div className="field">
            <span className="field-label">{t('profile.menstruation')}</span>
            <Segmented
              label={t('profile.menstruation')}
              value={p.menstruation ?? 'auto'}
              onChange={(v) => update({ menstruation: v === 'auto' ? undefined : v })}
              options={[
                { value: 'auto', label: t('profile.menstruationAuto') },
                { value: 'menstruating', label: t('profile.menstruationYes') },
                { value: 'postmenopausal', label: t('profile.menstruationPost') },
                { value: 'none', label: t('profile.menstruationNone') },
              ]}
            />
            <div className="field-hint">{t('profile.menstruationHint')}</div>
          </div>
        )}
        <div className="field">
          <span className="field-label">{t('profile.activity')}</span>
          <Segmented
            label={t('profile.activity')}
            value={p.activity ?? 'medium'}
            onChange={(v) => update({ activity: v })}
            options={[
              { value: 'low', label: t('profile.activityLow') },
              { value: 'medium', label: t('profile.activityMedium') },
              { value: 'high', label: t('profile.activityHigh') },
            ]}
          />
          {!p.activity && <div className="field-hint">{t('profile.defaultUsed')}</div>}
        </div>
        <div className="field">
          <span className="field-label">{t('profile.phytate')}</span>
          <Segmented
            label={t('profile.phytate')}
            value={p.phytate ?? 'medium'}
            onChange={(v) => update({ phytate: v })}
            options={[
              { value: 'low', label: t('profile.phytateLow') },
              { value: 'medium', label: t('profile.phytateMedium') },
              { value: 'high', label: t('profile.phytateHigh') },
            ]}
          />
          <div className="field-hint">{t('profile.phytateHint')}</div>
        </div>
        <Field label={t('profile.height')} hint={t('profile.heightHint')}>
          {(id) => <NumberInput id={id} value={p.heightCm} onChange={(v) => update({ heightCm: v })} suffix="cm" min={50} placeholder="—" />}
        </Field>
      </div>

      <h2 className="section-title">{t('profile.weight')}</h2>
      <div className="card">
        <p>{weight ? t('profile.currentWeight', { kg: weight }) : t('profile.noWeight')}</p>
        <div className="row">
          <NumberInput value={newWeight} onChange={setNewWeight} suffix="kg" min={20} placeholder={String(weight ?? 70)} />
          <button
            className="btn btn-primary btn-small"
            disabled={!newWeight}
            onClick={async () => {
              if (!newWeight) return;
              await update({ weightHistory: [...p.weightHistory.filter((w) => w.day !== d.today), { day: d.today, kg: newWeight }] });
              setNewWeight(undefined);
              toast(t('profile.weightSaved'));
            }}
          >
            {t('profile.addWeight')}
          </button>
        </div>
        {history.length > 0 && (
          <ul className="plain-list small">
            {history.slice(0, 10).map((w) => (
              <li key={w.day} className="row-between">
                <span>{formatDay(w.day, d.today)}</span>
                <span>
                  {w.kg} kg{' '}
                  <button className="icon-btn" aria-label={t('common.delete')} onClick={() => update({ weightHistory: p.weightHistory.filter((x) => x.day !== w.day) })}>
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="section-title">{t('profile.energy')}</h2>
      <EnergyTargetCard />
    </SubPage>
  );
}
