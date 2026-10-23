import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { goBack, navigate } from '../../app/router';
import { useToast } from '../../app/toast';
import { t, type MessageKey } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { atDayMinute, frequentActivities, usualNight, usualWater, type CatchUpKind } from '../../logic/catchUp';
import { repo } from '../../storage/repo';
import type { DayStatusRecord } from '../../storage/types';
import { BackButton } from '../../ui/BackButton';
import { Icon } from '../../ui/Icon';
import { ActivitySheet } from '../activity/ActivitySheet';
import { saveSleepWithUndo, SleepSheet } from '../sleep/SleepSheet';
import { spanText } from '../sleep/format';
import { useSleep } from '../sleep/useSleep';
import { addWaterWithUndo, WaterSheet } from '../water/WaterSheet';
import { waterText } from '../water/format';
import { skip, useCatchUp } from './useCatchUp';

const ICON: Record<CatchUpKind, string> = { food: 'diary', sleep: 'bed', activity: 'activity', water: 'drop' };
const NOON = 12 * 60;

/**
 * Fill in what a day lacks (owner's ask, 2026-10-23), one card per thing: log it yourself, take what
 * makes most sense (your usual night, a recent activity, your usual water, a day like your others),
 * or skip and leave it empty. Cards stay after they are answered, marked done, so the page does not jump.
 */
export function CatchUpPage({ day }: { day: string }) {
  const d = useData();
  const missing = useCatchUp(day);
  const [shown, setShown] = useState<CatchUpKind[]>();
  useEffect(() => {
    if (missing && !shown) setShown(missing);
  }, [missing, shown]);
  if (!missing || !shown) return null;
  const done = shown.every((k) => !missing.includes(k));

  return (
    <section className="catchup">
      <header className="page-head row">
        <BackButton />
        <h1 className="grow">{formatDay(day, d.today)}</h1>
      </header>
      {shown.length > 0 && <p className="muted">{t('catchUp.lead')}</p>}
      {shown.length === 0 && <p className="muted">{t('catchUp.nothing')}</p>}
      {shown.map((k) => (
        // Activity stays open once logged: the way home is a second commute.
        <CatchUpCard key={k} kind={k} open={missing.includes(k)} keepOpen={k === 'activity'}>
          {k === 'food' && <FoodChoices day={day} />}
          {k === 'sleep' && <SleepChoices day={day} />}
          {k === 'activity' && <ActivityChoices day={day} />}
          {k === 'water' && <WaterChoices day={day} />}
        </CatchUpCard>
      ))}
      {shown.length > 0 && done && (
        <div className="card catchup-done">
          <p>{t('catchUp.allDone')}</p>
          <button className="btn btn-primary" onClick={() => goBack()}>
            {t('catchUp.backHome')}
          </button>
        </div>
      )}
    </section>
  );
}

function CatchUpCard({ kind, open, keepOpen, children }: { kind: CatchUpKind; open: boolean; keepOpen?: boolean; children: ReactNode }) {
  return (
    <div className={open ? 'card catchup-card' : 'card catchup-card catchup-answered'}>
      <div className="catchup-head">
        <Icon name={ICON[kind]} size={20} />
        <h2 className="grow">{t(`catchUp.head.${kind}` as MessageKey)}</h2>
        {!open && (
          <span className="catchup-check">
            <Icon name="check" size={16} />
            {t('catchUp.answered')}
          </span>
        )}
      </div>
      {(open || keepOpen) && children}
    </div>
  );
}

function SkipButton({ day, kind, label = 'catchUp.skip' }: { day: string; kind: CatchUpKind; label?: MessageKey }) {
  const toast = useToast();
  return (
    <button className="btn btn-small btn-ghost" onClick={async () => toast(t('catchUp.skipped'), await skip(day, kind))}>
      {t(label)}
    </button>
  );
}

function FoodChoices({ day }: { day: string }) {
  const toast = useToast();
  const set = async (status: DayStatusRecord['status']) => {
    await repo.setDayStatus(day, status);
    toast(t('diary.statusSaved'), () => repo.setDayStatus(day, null));
  };
  return (
    <>
      <p className="muted small">{t('catchUp.food')}</p>
      <div className="prompt-actions">
        <button className="btn btn-small btn-primary" onClick={() => navigate('log', day)}>
          {t('catchUp.logMeals')}
        </button>
        <button className="btn btn-small" onClick={() => void set('filled')}>
          {t('catchUp.asUsual')}
        </button>
        <button className="btn btn-small" onClick={() => void set('fasted')}>
          {t('prompt.fasted')}
        </button>
        <button className="btn btn-small" onClick={() => void set('excluded')}>
          {t('prompt.leaveOut')}
        </button>
        <SkipButton day={day} kind="food" />
      </div>
      <p className="muted small">{t('catchUp.foodHint')}</p>
    </>
  );
}

function SleepChoices({ day }: { day: string }) {
  const toast = useToast();
  const records = useSleep();
  const [sheet, setSheet] = useState(false);
  if (!records) return null;
  const usual = usualNight(records, day);
  return (
    <>
      <p className="muted small">{t('catchUp.sleep')}</p>
      <div className="prompt-actions">
        {usual && (
          <button className="btn btn-small btn-primary" onClick={() => void saveSleepWithUndo(usual, toast)}>
            {t('catchUp.usualNight', { span: spanText(usual) })}
          </button>
        )}
        <button className="btn btn-small" onClick={() => setSheet(true)}>
          {t('catchUp.otherTimes')}
        </button>
        <SkipButton day={day} kind="sleep" />
      </div>
      {sheet && <SleepSheet initial={usual ?? { start: atDayMinute(day, 0) - 60 * 60_000, end: atDayMinute(day, 7 * 60) }} onClose={() => setSheet(false)} />}
    </>
  );
}

function ActivityChoices({ day }: { day: string }) {
  const d = useData();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const picks = useMemo(() => frequentActivities(d.activities, day), [d.activities, day]);
  const logged = d.activities.filter((a) => a.day === day).sort((a, b) => a.time - b.time);
  return (
    <>
      {logged.length > 0 && (
        <p className="small">
          {t('catchUp.loggedActivities', { list: logged.map((a) => `${a.name || t(`activity.kind.${a.kind}` as MessageKey)} ${t('catchUp.minutes', { m: a.minutes })}`).join(', ') })}
        </p>
      )}
      <p className="muted small">{t(logged.length ? (picks.length ? 'catchUp.activityMore' : 'catchUp.activityMoreNone') : picks.length ? 'catchUp.activity' : 'catchUp.activityNone')}</p>
      <div className="prompt-actions">
        {picks.map((p) => {
          const label = `${p.name || t(`activity.kind.${p.kind}` as MessageKey)} · ${t('catchUp.minutes', { m: p.minutes })}`;
          const add = async () => {
            const time = atDayMinute(day, p.startMinute);
            const added = await repo.addActivity({ kind: p.kind, name: p.name, time, day, minutes: p.minutes, intensity: p.intensity, outside: p.outside, sunSkin: p.sunSkin });
            toast(t('activity.saved'), () => void repo.deleteActivity(added.id));
          };
          return (
            <button key={label} className="btn btn-small" onClick={() => void add()}>
              <Icon name="plus" size={14} /> {label}
            </button>
          );
        })}
        <button className="btn btn-small" onClick={() => setSheet(true)}>
          {t('catchUp.otherActivity')}
        </button>
        {logged.length === 0 && <SkipButton day={day} kind="activity" label="catchUp.noActivity" />}
      </div>
      {sheet && <ActivitySheet defaultTime={atDayMinute(day, NOON)} onClose={() => setSheet(false)} />}
    </>
  );
}

function WaterChoices({ day }: { day: string }) {
  const toast = useToast();
  const water = useLiveQuery(() => repo.db.water.toArray(), []);
  const [sheet, setSheet] = useState(false);
  if (!water) return null;
  const usual = usualWater(water, day);
  return (
    <>
      <p className="muted small">{t('catchUp.water')}</p>
      <div className="prompt-actions">
        {usual !== undefined && (
          <button className="btn btn-small btn-primary" onClick={() => void addWaterWithUndo(usual, atDayMinute(day, NOON), toast)}>
            {t('catchUp.usualWater', { amount: waterText(usual) })}
          </button>
        )}
        <button className="btn btn-small" onClick={() => setSheet(true)}>
          {t('catchUp.otherAmount')}
        </button>
        <SkipButton day={day} kind="water" />
      </div>
      {sheet && <WaterSheet defaultTime={atDayMinute(day, NOON)} onClose={() => setSheet(false)} />}
    </>
  );
}
