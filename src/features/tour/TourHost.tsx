import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeAppData, DataContext, useData, type AppData } from '../../app/data';
import { addDays } from '../../lib/dates';
import { repo } from '../../storage/repo';
import { t } from '../../i18n';
import { pendingTour, TOURS, toursSeen, type TourId } from './tours';
import { sampleDayStatus, sampleLog, sampleRecipe, SAMPLE_DAYS } from './sample';
import { TourOverlay } from './TourOverlay';

interface TourControl {
  /** The round button tells the tour when its menu opens, so its own tour can start then. */
  setFanOpen: (open: boolean) => void;
}

const TourContext = createContext<TourControl>({ setFanOpen: () => undefined });

export function useTourControl(): TourControl {
  return useContext(TourContext);
}

/** Mark tours as seen (several at once for "No tours"), read fresh so two quick finishes don't overwrite each other. */
async function markSeen(ids: readonly string[]): Promise<void> {
  const seen = new Set((await repo.getSettings())?.toursSeen ?? []);
  for (const id of ids) seen.add(id);
  await repo.updateSettings({ toursSeen: [...seen] });
}

/**
 * The app's data with the sample week in place of the user's log and day statuses: the same model,
 * in memory only. Profile, settings and everything else stay the user's own.
 */
function useSampleData(d: AppData, on: boolean): AppData | undefined {
  const { today, foods } = d;
  return useMemo(() => {
    if (!on) return undefined;
    const now = Date.now();
    return computeAppData({
      today,
      foods,
      searchIndex: d.searchIndex,
      profile: { ...d.profile, modelStartDay: addDays(today, -SAMPLE_DAYS) },
      settings: d.settings,
      recipes: [...d.recipes, sampleRecipe(foods.version, now)],
      batches: d.batches,
      log: sampleLog(today, foods.version, now),
      customFoods: d.customFoods,
      dayStatus: sampleDayStatus(today),
      fasts: [],
      sunEntries: d.sunEntries,
      productList: d.products,
      activities: d.activities,
      ketones: [],
    });
    // Not on every settings write behind the tour (it writes toursSeen itself); the profile can change on the About you sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, today, foods, d.profile]);
}

/**
 * Runs the guided tours (docs/SPEC.md "First launch and guided tours"): each one the first time its
 * screen is opened, once. While a tour that wants it runs, and behind the first-launch sheets, the
 * screens see the sample week instead of the user's (empty) data.
 */
export function TourHost({ route, children }: { route: readonly string[]; children: ReactNode }) {
  const d = useData();
  const [fanOpen, setFanOpen] = useState(false);
  const [running, setRunning] = useState<TourId>();
  // Tours finished in this session, so one isn't started again before the settings write lands.
  const done = useRef(new Set<string>());
  const candidate = pendingTour(route, d.settings, d.profile.onboarded, fanOpen, done.current);

  useEffect(() => {
    if (!running && candidate) setRunning(candidate);
  }, [candidate, running]);

  const finish = useCallback(
    (ids: readonly string[]) => {
      for (const id of ids) done.current.add(id);
      setRunning(undefined);
      void markSeen(ids);
    },
    [],
  );

  // Leaving the screen (back button, a link) ends its tour; it counts as seen.
  const routeKey = route.join('/');
  const startedOn = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!running) {
      startedOn.current = undefined;
      return;
    }
    if (startedOn.current === undefined) startedOn.current = running === 'fan' ? `fan:${routeKey}` : routeKey;
    else if (running !== 'fan' && startedOn.current !== routeKey) finish([running]);
  }, [running, routeKey, finish]);
  useEffect(() => {
    if (running === 'fan' && !fanOpen) finish(['fan']);
  }, [running, fanOpen, finish]);

  // The tour about to start counts too, so the screen doesn't flash empty between the two.
  const showing = running ?? candidate;
  const sampleOn = !d.profile.onboarded || (!!showing && !!TOURS[showing].sample);
  const sample = useSampleData(d, sampleOn);
  const control = useMemo(() => ({ setFanOpen }), []);
  const seenAll = toursSeen(d.settings);

  return (
    <TourContext.Provider value={control}>
      {sample && (
        <>
          <div className="sample-band" role="status">
            {t('tour.sampleBand')}
          </div>
          <div className="sample-band-space" aria-hidden />
        </>
      )}
      <DataContext.Provider value={sample ?? d}>{children}</DataContext.Provider>
      {running && (
        <TourOverlay
          key={running}
          id={running}
          profileEmpty={!d.profile.birthYear && !d.profile.sex && d.profile.weightHistory.length === 0}
          onDone={() => finish([running])}
          onNoTours={() => finish(Object.keys(TOURS).filter((id) => !seenAll.has(id) || id === running))}
        />
      )}
    </TourContext.Provider>
  );
}
