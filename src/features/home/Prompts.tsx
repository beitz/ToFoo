import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { addDays, daysBetween } from '../../lib/dates';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { NumberInput, Segmented } from '../../ui/controls';

const DISMISS_DAYS = 30;

/** One gentle question or note at a time. */
export function Prompts() {
  const d = useData();
  const meta = useLiveQuery(() => repo.db.meta.toArray(), []);
  const [weight, setWeight] = useState<number>();
  const [year, setYear] = useState<number>();
  if (!meta) return null;
  const m = new Map(meta.map((r) => [r.key, r.value]));
  const dismissed = (key: string) => {
    const at = m.get(`dismissed:${key}`) as string | undefined;
    return !!at && daysBetween(at, d.today) < DISMISS_DAYS;
  };
  const dismiss = (key: string) => repo.setMeta(`dismissed:${key}`, d.today);
  const yesterday = addDays(d.today, -1);
  const f = d.settings.features;

  // 1. Yesterday without status
  if (isOn(f, 'yesterdayNudge') && yesterday >= d.profile.modelStartDay && d.model.dayStatus[yesterday] === 'unknown' && !m.get(`nudge:${yesterday}`)) {
    return (
      <div className="card prompt">
        <p>{t('prompt.yesterday')}</p>
        <div className="prompt-actions">
          <button className="btn btn-small" onClick={() => navigate('log', yesterday)}>
            {t('prompt.logYesterday')}
          </button>
          <button className="btn btn-small" onClick={() => repo.setDayStatus(yesterday, 'fasted')}>
            {t('prompt.fasted')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => repo.setMeta(`nudge:${yesterday}`, true)}>
            {t('prompt.notLogged')}
          </button>
        </div>
      </div>
    );
  }

  // 2. Backup reminder
  const lastBackup = m.get('lastBackupDay') as string | undefined;
  const dueSince = lastBackup ?? d.profile.modelStartDay;
  if (isOn(f, 'backupReminder') && d.log.length >= 5 && daysBetween(dueSince, d.today) >= d.settings.backupReminderDays && !dismissed('backup')) {
    return (
      <div className="card prompt">
        <p>{lastBackup ? t('prompt.backupOld', { days: daysBetween(lastBackup, d.today) }) : t('prompt.backupNever')}</p>
        <div className="prompt-actions">
          <a className="btn btn-small" href={href('settings', 'backup')}>
            {t('prompt.backupNow')}
          </a>
          <button className="btn btn-small btn-ghost" onClick={() => repo.setMeta('dismissed:backup', addDays(d.today, 3 - DISMISS_DAYS))}>
            {t('common.later')}
          </button>
        </div>
      </div>
    );
  }

  // 3. Profile questions, one at a time
  const p = d.profile;
  if (!p.weightHistory.length && !dismissed('weight')) {
    return (
      <div className="card prompt">
        <p>{t('prompt.weight')}</p>
        <div className="prompt-row">
          <NumberInput value={weight} onChange={setWeight} placeholder="70" suffix="kg" min={20} />
          <button className="btn btn-small btn-primary" disabled={!weight} onClick={() => weight && repo.updateProfile({ weightHistory: [{ day: d.today, kg: weight }] })}>
            {t('common.save')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => dismiss('weight')}>
            {t('common.later')}
          </button>
        </div>
      </div>
    );
  }
  if (!p.sex && !dismissed('sex')) {
    return (
      <div className="card prompt">
        <p>{t('prompt.sex')}</p>
        <div className="prompt-actions">
          <button className="btn btn-small" onClick={() => repo.updateProfile({ sex: 'female' })}>
            {t('profile.female')}
          </button>
          <button className="btn btn-small" onClick={() => repo.updateProfile({ sex: 'male' })}>
            {t('profile.male')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => dismiss('sex')}>
            {t('common.later')}
          </button>
        </div>
      </div>
    );
  }
  if (!p.birthYear && !dismissed('age')) {
    return (
      <div className="card prompt">
        <p>{t('prompt.age')}</p>
        <div className="prompt-row">
          <NumberInput value={year} onChange={setYear} placeholder="1990" min={1900} />
          <button className="btn btn-small btn-primary" disabled={!year || year < 1900 || year > Number(d.today.slice(0, 4))} onClick={() => year && repo.updateProfile({ birthYear: Math.round(year) })}>
            {t('common.save')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => dismiss('age')}>
            {t('common.later')}
          </button>
        </div>
      </div>
    );
  }
  if (!p.activity && !dismissed('activity')) {
    return (
      <div className="card prompt">
        <p>{t('prompt.activity')}</p>
        <Segmented
          label={t('profile.activity')}
          value={'medium' as const}
          options={[
            { value: 'low', label: t('profile.activityLow') },
            { value: 'medium', label: t('profile.activityMedium') },
            { value: 'high', label: t('profile.activityHigh') },
          ]}
          onChange={(v) => repo.updateProfile({ activity: v })}
        />
        <button className="btn btn-small btn-ghost" onClick={() => dismiss('activity')}>
          {t('common.later')}
        </button>
      </div>
    );
  }
  if (!p.outdoorRoutine && !dismissed('sun')) {
    return (
      <div className="card prompt">
        <p>{t('prompt.sun')}</p>
        <div className="prompt-actions">
          <a className="btn btn-small" href={href('settings', 'sun')}>
            {t('prompt.setRoutine')}
          </a>
          <button className="btn btn-small btn-ghost" onClick={() => dismiss('sun')}>
            {t('common.later')}
          </button>
        </div>
      </div>
    );
  }
  return null;
}
