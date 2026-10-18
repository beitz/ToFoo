import { useEffect, useState } from 'react';
import { useData } from '../../app/data';
import { useBackCloses } from '../../app/history';
import { navigate } from '../../app/router';
import { t } from '../../i18n';
import { isOn } from '../../settings/features';
import { Icon } from '../../ui/Icon';
import { ActivitySheet } from '../activity/ActivitySheet';
import { SleepButton } from '../sleep/SleepButton';
import { DialItem } from './DialItem';

/**
 * The round button on Home, with the assistant's button right above it. Closed they take two
 * buttons' space; the first tap turns the big one into + and fans out the other quick actions
 * above, the second tap on + opens Log meal.
 * Tapping outside, Escape or the phone's back gesture closes it again.
 */
export function QuickActions({ onFast }: { onFast: () => void }) {
  const d = useData();
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState(false);
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

  return (
    <>
      <div className={`dial-scrim${open ? ' open' : ''}`} onClick={close} aria-hidden />
      <div className={`fab-stack dial${open ? ' open' : ''}`}>
        {/* Hidden items stay rendered so they can animate out; visibility keeps them out of reach. */}
        <div className="dial-items" id="home-actions" role="group" aria-label={t('home.quickActions')}>
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
          <DialItem
            icon="moon"
            label={d.activeFast ? t('home.endFast') : t('home.startFast')}
            on={!!d.activeFast}
            onClick={() => {
              close();
              onFast();
            }}
          />
        </div>
        {/* The assistant is always one tap away, right above Log meal; its name shows with the others. */}
        {on('aiAssistant') && <DialItem icon="chat" label={t('ai.pageTitle')} pinned onClick={() => go('assistant')} />}
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
            aria-controls="home-actions"
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
    </>
  );
}
