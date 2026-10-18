import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { addDays, daysBetween } from '../../lib/dates';
import { isOn } from '../../settings/features';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { testHintText } from '../nutrient/testHint';
import { repo } from '../../storage/repo';
import { NumberInput, Segmented } from '../../ui/controls';

const DISMISS_DAYS = 30;
/** "Later" on the backup reminder hides it this long. */
const LATER_DAYS = 3;

/**
 * The backup reminder, then one gentle question or note at a time. The reminder has its own card so
 * the other questions cannot hide it: it stays until a backup file is saved or "Later" is tapped.
 */
export function Prompts() {
  return (
    <>
      <BackupReminder />
      <OnePrompt />
    </>
  );
}

function BackupReminder() {
  const d = useData();
  const meta = useLiveQuery(async () => ({ last: await repo.getMeta<string>('lastBackupDay'), later: await repo.getMeta<string>('dismissed:backup') }), []);
  if (!meta) return null;
  const { last, later } = meta;
  const dueSince = last ?? d.profile.modelStartDay;
  // "Later" is stored LATER_DAYS short of the usual dismissal, so it ends after LATER_DAYS.
  const hidden = !!later && daysBetween(later, d.today) < DISMISS_DAYS;
  if (!isOn(d.settings.features, 'backupReminder') || d.log.length < 5 || daysBetween(dueSince, d.today) < d.settings.backupReminderDays || hidden) return null;
  return (
    <div className="card prompt">
      <p>{last ? t('prompt.backupOld', { days: daysBetween(last, d.today) }) : t('prompt.backupNever')}</p>
      <div className="prompt-actions">
        <a className="btn btn-small" href={href('settings', 'backup')}>
          {t('prompt.backupNow')}
        </a>
        <button className="btn btn-small btn-ghost" onClick={() => repo.setMeta('dismissed:backup', addDays(d.today, LATER_DAYS - DISMISS_DAYS))}>
          {t('common.later')}
        </button>
      </div>
    </div>
  );
}

function OnePrompt() {
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
          <button className="btn btn-small" onClick={() => repo.setDayStatus(yesterday, 'excluded')}>
            {t('prompt.leaveOut')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => repo.setMeta(`nudge:${yesterday}`, true)}>
            {t('prompt.notLogged')}
          </button>
        </div>
      </div>
    );
  }

  // 2. A slow store whose intake has been low for weeks: only a blood test shows the real level.
  for (const r of d.model.nutrients.values()) {
    const text = testHintText(r, NUTRIENT_BY_ID.get(r.id)?.name ?? r.id);
    if (!text || dismissed(`testHint:${r.id}`) || d.settings.hiddenNutrients.includes(r.id)) continue;
    return (
      <div className="card prompt">
        <p>{text}</p>
        <div className="prompt-actions">
          <a className="btn btn-small" href={href('nutrient', r.id)}>
            {t('prompt.testHintDetails')}
          </a>
          <button className="btn btn-small btn-ghost" onClick={() => dismiss(`testHint:${r.id}`)}>
            {t('common.later')}
          </button>
        </div>
      </div>
    );
  }

  // 4. Profile questions, one at a time
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
