import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useRoute, href } from './router';
import { t } from '../i18n';
import { DataProvider, useData } from './data';
import { ToastProvider } from './toast';
import { ErrorBoundary } from './ErrorBoundary';
import { diag, layoutSnapshot } from './diagnostics';
import { Icon } from '../ui/Icon';
import { AboutPage } from '../features/about/AboutPage';
import { HomePage } from '../features/home/HomePage';
import { FastShortcut } from '../features/home/FastShortcut';
import { SleepShortcut } from '../features/sleep/SleepShortcut';
import { CalendarPage } from '../features/review/CalendarPage';
import { ReviewPage } from '../features/review/ReviewPage';
import { WeekPage } from '../features/review/WeekPage';
import { LogPage } from '../features/log/LogPage';
import { AssistantPage } from '../features/assistant/AssistantPage';
import { AssistantSettingsPage } from '../features/settings/AssistantSettingsPage';
import { UsdaSettingsPage } from '../features/settings/UsdaSettingsPage';
import { DiaryPage } from '../features/diary/DiaryPage';
import { JournalPage } from '../features/journal/JournalPage';
import { ShoppingPage } from '../features/shopping/ShoppingPage';
import { KitchenPage } from '../features/kitchen/KitchenPage';
import { QuickActions, hidesQuickActions } from '../features/home/QuickActions';
import { RecipesPage } from '../features/recipes/RecipesPage';
import { RecipeEditor } from '../features/recipes/RecipeEditor';
import { RecipeView } from '../features/recipes/RecipeView';
import { splitContext } from '../features/nutrient/NutrientSplit';
import { NutrientPage } from '../features/nutrient/NutrientPage';
import { NutrientFoodsPage } from '../features/nutrient/NutrientFoodsPage';
import { WhyPage } from '../features/nutrient/WhyPage';
import { FoodPage } from '../features/food/FoodPage';
import { EntryNutrientsPage, MealNutrientsPage } from '../features/meal/MealNutrientsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ProfilePage } from '../features/settings/ProfilePage';
import { SunPage } from '../features/settings/SunPage';
import { DiagnosticsPage } from '../features/settings/DiagnosticsPage';
import { SavedChatsPage } from '../features/settings/SavedChatsPage';
import { ProductsPage } from '../features/settings/ProductsPage';
import { BackupPage, ExclusionsPage, NutrientVisibilityPage, SavedPage, StartPage } from '../features/settings/MorePages';
import { InsightsPage } from '../features/insights/InsightsPage';
import { Onboarding } from '../features/onboarding/Onboarding';
import { FastPage } from '../features/fast/FastPage';
import { CookPage } from '../features/recipes/CookPage';
import { SleepPage } from '../features/sleep/SleepPage';
import { CatchUpPage } from '../features/catchup/CatchUpPage';
import { ActivityPage } from '../features/trackers/ActivityPage';
import { WaterPage } from '../features/trackers/WaterPage';

function Page({ route }: { route: string[] }) {
  const d = useData();
  const [a, b, c, e] = route;
  if (!d.profile.onboarded) return <Onboarding />;
  switch (a) {
    case 'log':
      return <LogPage key={`${b}-${c}`} day={b} foodCode={c} />;
    case 'assistant':
      if (b === 'chat') return <AssistantPage key={`chat-${c}`} chatId={c} />;
      return <AssistantPage key={b} day={b} />;
    case 'diary':
      return <DiaryPage day={b} />;
    case 'journal':
      return <JournalPage />;
    case 'insights':
      return <InsightsPage />;
    case 'shopping':
      return <ShoppingPage />;
    case 'athome':
    case 'kitchen':
      return <KitchenPage />;
    case 'cook':
      return <CookPage key={b} id={b ?? ''} />;
    case 'recipes':
      if (b === 'new') return <RecipeEditor key="new" />;
      if (b && c === 'edit') return <RecipeEditor key={b} id={b} />;
      if (b) return <RecipeView id={b} />;
      return <RecipesPage />;
    case 'nutrient':
      if (c === 'foods') return <NutrientFoodsPage key={b} id={b ?? ''} />;
      if (c === 'why') return <WhyPage key={b} id={b ?? ''} />;
      return <NutrientPage key={route.join('/')} id={b ?? ''} context={splitContext(c, e)} />;
    case 'food':
      return <FoodPage code={b ?? ''} />;
    case 'meal':
      return <MealNutrientsPage key={b} entryId={b ?? ''} />;
    case 'entry':
      return <EntryNutrientsPage key={`${b}-${c}`} entryId={b ?? ''} part={c} />;
    case 'settings':
      switch (b) {
        case 'profile':
          return <ProfilePage />;
        case 'sun':
          return <SunPage />;
        case 'start':
          return <StartPage />;
        case 'exclusions':
          return <ExclusionsPage />;
        case 'nutrients':
          return <NutrientVisibilityPage />;
        case 'saved':
          return <SavedPage />;
        case 'backup':
          return <BackupPage />;
        case 'assistant':
          return <AssistantSettingsPage />;
        case 'usda':
          return <UsdaSettingsPage />;
        case 'diagnostics':
          return <DiagnosticsPage />;
        case 'chats':
          return <SavedChatsPage />;
        case 'products':
          return <ProductsPage />;
        default:
          return <SettingsPage />;
      }
    case 'about':
      return <AboutPage />;
    case 'calendar':
      return <CalendarPage month={b} />;
    case 'review':
      return <ReviewPage from={b} to={c} />;
    case 'week':
      return <WeekPage week={b} />;
    case 'fast':
      return <FastShortcut />;
    case 'fasting':
      return <FastPage />;
    case 'sleep':
      return <SleepShortcut />;
    case 'nights':
      return <SleepPage />;
    case 'activity':
      return <ActivityPage />;
    case 'water':
      return <WaterPage />;
    case 'catchup':
      return <CatchUpPage key={b} day={b ?? d.today} />;
    default:
      return <HomePage />;
  }
}

/** Three tabs (owner's decision, 2026-10-22); Settings sits top right on each tab's first screen. */
/** Its children only once the user has been through onboarding. */
function Onboarded({ children }: { children: ReactNode }) {
  return useData().profile.onboarded ? <>{children}</> : null;
}

const NAV = [
  { key: 'home', to: [] as string[], icon: 'home', label: 'nav.home' },
  { key: 'insights', to: ['diary'], icon: 'chart', label: 'nav.insights' },
  { key: 'kitchen', to: ['kitchen'], icon: 'kitchen', label: 'nav.kitchen' },
] as const;

/** Which tab a screen belongs to; none for Settings and its pages. */
const TAB_OF: Record<string, (typeof NAV)[number]['key'] | null> = {
  diary: 'insights',
  insights: 'insights',
  week: 'insights',
  calendar: 'insights',
  review: 'insights',
  meal: 'insights',
  entry: 'insights',
  journal: 'insights',
  nights: 'insights',
  activity: 'insights',
  water: 'insights',
  fasting: 'insights',
  catchup: 'insights',
  kitchen: 'kitchen',
  athome: 'kitchen',
  recipes: 'kitchen',
  cook: 'kitchen',
  shopping: 'kitchen',
  settings: null,
  about: null,
};

export function App() {
  const route = useRoute();
  const section = route[0] ?? 'home';
  const active = section in TAB_OF ? TAB_OF[section] : 'home';
  const path = route.join('/');
  // Braces matter: an effect's return value is its cleanup, and newer Chrome returns a Promise
  // from scrollTo. React then called that Promise on the next screen change ("is not a function")
  // and unmounted the app: the black screen on Android Chrome 155.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  // Device diagnostics (Settings → Diagnostics): what each screen change produced.
  useLayoutEffect(() => {
    diag('commit', { route: path, ...layoutSnapshot() });
  }, [path]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="app">
          <main className="page">
            <DataProvider
              fallback={({ error }) =>
                error ? (
                  <div className="center-message" role="alert">
                    <p>{t('app.loadError')}</p>
                    <pre className="small">{error}</pre>
                  </div>
                ) : (
                  <div className="center-message muted">{t('common.loading')}</div>
                )
              }
            >
              {/* Keyed by route: navigating away from a broken page gives the next page a fresh start. */}
              <ErrorBoundary key={path} showHome={route.length > 0}>
                <Page route={route} />
              </ErrorBoundary>
              {!hidesQuickActions(route) && <Onboarded>{<QuickActions key={route[0] ?? 'home'} />}</Onboarded>}
            </DataProvider>
          </main>
          <nav className="bottom-nav" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.key} href={href(...n.to)} aria-current={active === n.key ? 'page' : undefined}>
                <Icon name={n.icon} size={24} />
                {t(n.label)}
              </a>
            ))}
          </nav>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
