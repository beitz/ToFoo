import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadFoodDb, groupSearchBoost, type FoodDb } from '../foods/foodDb';
import { buildIndex, type SearchIndex } from '../foods/search';
import { dayRange, todayKey, addDays } from '../lib/dates';
import { refKey } from '../lib/refs';
import { isOn } from '../settings/features';
import { repo } from '../storage/repo';
import type { Batch, CustomFood, DayStatusRecord, Fast, LogEntry, Product, Profile, Recipe, Settings, SunEntry } from '../storage/types';
import { resolveRequirements, type ResolvedRequirements } from '../model/requirements';
import { simulate, type SimulationResult } from '../model/simulate';
import type { ModelEntry } from '../model/types';
import { currentWeight, explicitDayStatus, resolveEntry, sunByDay, activeFast } from '../logic/resolve';

/** Longest history the model simulates (performance guard). */
const MAX_MODEL_DAYS = 730;

export interface AppData {
  today: string;
  foods: FoodDb;
  searchIndex: SearchIndex;
  searchBoost: (key: string) => number;
  profile: Profile;
  settings: Settings;
  recipes: Recipe[];
  batches: Batch[];
  batchesById: Map<string, Batch>;
  log: LogEntry[];
  customFoods: CustomFood[];
  customFoodsById: Map<string, CustomFood>;
  /** Foods from online databases (Open Food Facts, USDA) saved on this device, most recently used first. */
  products: Product[];
  /** Products by id (`OFF:<barcode>`, `USDA:<fdcId>`, the same as `refKey` of their FoodRef). */
  productsById: Map<string, Product>;
  dayStatus: DayStatusRecord[];
  fasts: Fast[];
  sunEntries: SunEntry[];
  requirements: ResolvedRequirements;
  modelEntries: ModelEntry[];
  model: SimulationResult;
  /** The days the model covers, aligned with `model.daily`. */
  modelDays: string[];
  activeFast: Fast | undefined;
  /** Food code → recency boost (0–1), for search. */
  recentFoods: Map<string, number>;
  weightKg: number;
}

const DataContext = createContext<AppData | null>(null);

export function useData(): AppData {
  const d = useContext(DataContext);
  if (!d) throw new Error('useData outside DataProvider');
  return d;
}

function useToday(): string {
  const [today, setToday] = useState(todayKey());
  useEffect(() => {
    const tick = () => setToday(todayKey());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return today;
}

export function DataProvider({ children, fallback }: { children: ReactNode; fallback: (state: { error?: string }) => ReactNode }) {
  const today = useToday();
  const [foods, setFoods] = useState<FoodDb | null>(null);
  const [error, setError] = useState<string>();
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    loadFoodDb(import.meta.env.BASE_URL).then(setFoods, (e: unknown) => setError(String(e)));
    repo.init(todayKey()).then(
      () => setInitialised(true),
      (e: unknown) => setError(String(e)),
    );
    // Ask the browser to keep our data (Android may otherwise clear it under storage pressure).
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  const profile = useLiveQuery(() => (initialised ? repo.getProfile() : undefined), [initialised]);
  const settings = useLiveQuery(() => (initialised ? repo.getSettings() : undefined), [initialised]);
  const recipes = useLiveQuery(() => repo.db.recipes.toArray(), []);
  const batches = useLiveQuery(() => repo.db.batches.toArray(), []);
  const log = useLiveQuery(() => repo.db.log.orderBy('time').toArray(), []);
  const customFoods = useLiveQuery(() => repo.db.customFoods.toArray(), []);
  const dayStatus = useLiveQuery(() => repo.db.dayStatus.toArray(), []);
  const fasts = useLiveQuery(() => repo.db.fasts.toArray(), []);
  const sunEntries = useLiveQuery(() => repo.db.sunEntries.toArray(), []);
  const productList = useLiveQuery(() => repo.db.products.toArray(), []);

  const searchIndex = useMemo(() => (foods ? buildIndex(foods.foods.map((f) => ({ key: f.code, nameEn: f.nameEn, nameDe: f.nameDe }))) : null), [foods]);

  const theme = settings?.theme;
  useEffect(() => {
    if (!theme || theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const value = useMemo<AppData | null>(() => {
    if (!foods || !searchIndex || !profile || !settings || !recipes || !batches || !log || !customFoods || !dayStatus || !fasts || !sunEntries || !productList) return null;
    const batchesById = new Map(batches.map((b) => [b.id, b]));
    const customFoodsById = new Map(customFoods.map((c) => [c.id, c]));
    const weight = currentWeight(profile);
    const requirements = resolveRequirements(
      { birthYear: profile.birthYear, sex: profile.sex, weightKg: weight, activity: profile.activity, phytate: profile.phytate, menstruation: profile.menstruation },
      Number(today.slice(0, 4)),
    );
    const productsById = new Map(productList.map((p) => [p.id, p]));
    const ctx = { foods, products: productsById, batches: batchesById, customFoods: customFoodsById, salt: profile.salt };
    const modelEntries = log.map((e) => resolveEntry(e, ctx)).filter((e): e is ModelEntry => e !== null);
    const earliestLog = log.reduce((min, e) => (e.day < min ? e.day : min), profile.modelStartDay);
    const start = earliestLog < addDays(today, -MAX_MODEL_DAYS) ? addDays(today, -MAX_MODEL_DAYS) : earliestLog;
    const days = dayRange(start <= today ? start : today, today);
    const f = settings.features;
    const model = simulate({
      days,
      dayStatus: explicitDayStatus(dayStatus, fasts, log, customFoodsById, today),
      entries: modelEntries,
      requirements,
      settings: {
        absorption: isOn(f, 'absorption'),
        retention: isOn(f, 'retention'),
        sun: isOn(f, 'sunVitaminD'),
        imputeUnlogged: isOn(f, 'fillUnloggedDays'),
        shortWindowDays: settings.shortWindowDays,
        longWindowDays: settings.longWindowDays,
        mealWindowMinutes: settings.mealWindowMinutes,
      },
      sunByDay: sunByDay(days, profile, sunEntries),
      startingLevel: profile.startingLevel,
      customStartLevels: profile.customStartLevels,
      weightKg: weight ?? 70,
      sex: profile.sex,
    });
    const recentFoods = new Map<string, number>();
    let rank = 0;
    const lastUsed = new Map<string, number>();
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i]!;
      if (e.kind !== 'food') continue;
      if ((e.ref.source === 'OFF' || e.ref.source === 'USDA') && !lastUsed.has(refKey(e.ref))) lastUsed.set(refKey(e.ref), e.time);
      if (rank < 60 && e.ref.source === 'BLS' && !recentFoods.has(e.ref.code)) recentFoods.set(e.ref.code, 1 / (1 + rank++ * 0.15));
    }
    const products = [...productList].sort((a, b) => (lastUsed.get(b.id) ?? b.fetchedAt) - (lastUsed.get(a.id) ?? a.fetchedAt));
    for (const r of recipes) for (const ing of r.ingredients) if (ing.ref.source === 'BLS' && !recentFoods.has(ing.ref.code)) recentFoods.set(ing.ref.code, 0.3);
    return {
      today,
      foods,
      searchIndex,
      searchBoost: (key: string) => groupSearchBoost(key.charAt(0)),
      profile,
      settings,
      recipes,
      batches,
      batchesById,
      log,
      customFoods,
      customFoodsById,
      products,
      productsById,
      dayStatus,
      fasts,
      sunEntries,
      requirements,
      modelEntries,
      model,
      modelDays: days,
      activeFast: activeFast(fasts, log, customFoodsById, today),
      recentFoods,
      weightKg: weight ?? 70,
    };
  }, [foods, searchIndex, profile, settings, recipes, batches, log, customFoods, dayStatus, fasts, sunEntries, productList, today]);

  if (error) return <>{fallback({ error })}</>;
  if (!value) return <>{fallback({})}</>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
