import { useEffect, useState } from 'react';
import { useData } from '../../app/data';
import { useBackCloses } from '../../app/history';
import { navigate } from '../../app/router';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Field, Sheet } from '../../ui/controls';
import { DateInput } from '../../ui/DateInputs';
import { Icon } from '../../ui/Icon';
import { ActivitySheet } from '../activity/ActivitySheet';
import { SleepButton } from '../sleep/SleepButton';
import { DialItem } from './DialItem';
import { endFast } from '../fast/fastActions';

/**
 * The round button bottom right, on every screen but full-screen tasks (owner's ask, 2026-10-22).
 * Closed it takes one button's space; the first tap turns it into + and fans out the quick actions
 * above, the assistant nearest; the second tap on + opens Log meal. Tapping outside, Escape or the
 * phone's back gesture closes it again. The Kitchen tab holds At home and the shopping list, so they are
 * not in the fan.
 */
export function QuickActions() {
  const d = useData();
  const toast = useToast();
  const { today } = d;
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState(false);
  const [fastSheet, setFastSheet] = useState(false);
  const [fastStart, setFastStart] = useState(today);
  const close = () => setOpen(false);
  useBackCloses(open, close);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (...parts: string[]) => {
    close();
    navigate(...parts);
  };
  const on = (key: Parameters<typeof isOn>[1]) => isOn(d.settings.features, key);

  async function toggleFast() {
    if (d.activeFast) {
      await endFast(d.activeFast, today, toast);
    } else {
      setFastStart(today);
      setFastSheet(true);
    }
  }

  async function startFast() {
    const f = await repo.startFast(fastStart <= today ? fastStart : today);
    setFastSheet(false);
    toast(t('home.fastStarted'), () => repo.deleteFast(f.id));
  }

  return (
    <>
      <div className={`dial-scrim${open ? ' open' : ''}`} onClick={close} aria-hidden />
      <div className={`fab-stack dial${open ? ' open' : ''}`}>
        {/* Hidden items stay rendered so they can animate out; visibility keeps them out of reach. */}
        <div className="dial-items" id="quick-actions" role="group" aria-label={t('home.quickActions')}>
          {on('journal') && <DialItem icon="journal" label={t('home.journal')} onClick={() => go('journal')} />}
          {on('activity') && (
            <DialItem
              icon="activity"
              label={t('home.logActivity')}
              onClick={() => {
                close();
                setActivity(true);
              }}
            />
          )}
          {on('sleep') && <SleepButton onDone={close} />}
          {(on('fasting') || d.activeFast) && (
            <DialItem
              icon="moon"
              label={d.activeFast ? t('home.endFast') : t('home.startFast')}
              on={!!d.activeFast}
              onClick={() => {
                close();
                void toggleFast();
              }}
            />
          )}
          {on('aiAssistant') && <DialItem icon="chat" label={t('ai.pageTitle')} onClick={() => go('assistant')} />}
        </div>
        <div className="dial-main">
          <span className="dial-label" aria-hidden>
            {t('home.logMeal')}
          </span>
          <button
            className="fab"
            onClick={() => (open ? go('log') : setOpen(true))}
            aria-label={open ? t('home.logMeal') : t('home.quickActions')}
            title={open ? t('home.logMeal') : t('home.quickActions')}
            aria-expanded={open}
            aria-controls="quick-actions"
          >
            <span className="dial-icon dial-icon-closed">
              <Icon name="apps" size={26} />
            </span>
            <span className="dial-icon dial-icon-open">
              <Icon name="plus" size={28} />
            </span>
          </button>
        </div>
      </div>
      {activity && <ActivitySheet defaultTime={Date.now()} onClose={() => setActivity(false)} />}
      {fastSheet && (
        <Sheet title={t('home.fasting')} onClose={() => setFastSheet(false)}>
          <Field label={t('home.fastSince')} hint={t('home.fastHint')}>
            {(id) => <DateInput id={id} value={fastStart} max={today} onChange={(e) => e.target.value && setFastStart(e.target.value)} />}
          </Field>
          <div className="sheet-actions">
            <button className="btn btn-primary" onClick={() => void startFast()}>
              {t('home.startFast')}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Routes that fill the screen with one task, where the round button would cover its controls. */
export function hidesQuickActions(route: readonly string[]): boolean {
  const [a, b, c] = route;
  if (a === 'log' || a === 'assistant' || a === 'insights' || a === 'shopping' || a === 'fast' || a === 'sleep' || a === 'cook') return true;
  return a === 'recipes' && (b === 'new' || c === 'edit');
}
