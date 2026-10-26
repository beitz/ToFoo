import { useData } from '../../app/data';
import { t, type MessageKey } from '../../i18n';
import type { CatchUpKind } from '../../logic/catchUp';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Segmented } from '../../ui/controls';
import { weekdayName } from '../habits/HabitParts';

type Mode = 'every' | 'some' | 'never';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
/** Where "Set days" starts from: the working week. */
const START_DAYS = [1, 2, 3, 4, 5];

/**
 * Per thing the fill-in page asks about, the weekdays to ask on (owner's ask, 2026-10-26: he sleeps
 * every night, so a daily question about sleep helps, but he doesn't do activities every day). Under
 * "Ask about yesterday"; the same days decide what counts as not logged in the diary and calendar.
 */
export function AskDays() {
  const d = useData();
  const f = d.settings.features;
  const ask = d.settings.askDays ?? {};
  const kinds: CatchUpKind[] = ['food', ...(['sleep', 'activity', 'water', 'habits'] as const).filter((k) => isOn(f, k))];
  const save = (kind: CatchUpKind, days: number[] | undefined) => {
    const next = { ...ask };
    if (days) next[kind] = [...days].sort();
    else delete next[kind];
    void repo.updateSettings({ askDays: next });
  };
  return (
    <div className="ask-days">
      <p className="muted small">{t('askDays.lead')}</p>
      {kinds.map((kind) => {
        const days = ask[kind];
        const mode: Mode = !days ? 'every' : days.length ? 'some' : 'never';
        const head = t(`catchUp.head.${kind}` as MessageKey);
        return (
          <div key={kind} className="ask-days-row">
            <p className="ask-days-head">
              {head}
              <span className="muted small"> · {mode === 'some' ? days!.map((n) => weekdayName(n)).join(', ') : t(mode === 'every' ? 'askDays.every' : 'askDays.never')}</span>
            </p>
            <Segmented<Mode>
              label={t('askDays.which', { kind: head })}
              value={mode}
              onChange={(m) => save(kind, m === 'every' ? undefined : m === 'never' ? [] : mode === 'some' ? days : START_DAYS)}
              options={[
                { value: 'every', label: t('askDays.every') },
                { value: 'some', label: t('askDays.some') },
                { value: 'never', label: t('askDays.never') },
              ]}
            />
            {mode === 'some' && days && (
              <div className="chips habit-weekdays" role="group" aria-label={t('askDays.onDays', { kind: head })}>
                {WEEKDAYS.map((n) => {
                  const on = days.includes(n);
                  const last = on && days.length === 1;
                  return (
                    <button
                      key={n}
                      type="button"
                      className={on ? 'chip on' : 'chip'}
                      aria-pressed={on}
                      // The last day stays: none at all is "Never".
                      disabled={last}
                      onClick={() => save(kind, on ? days.filter((x) => x !== n) : [...days, n])}
                    >
                      {weekdayName(n)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
