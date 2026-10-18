import { useEffect, useLayoutEffect } from 'react';
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
import { LogPage } from '../features/log/LogPage';
import { AssistantPage } from '../features/assistant/AssistantPage';
import { AssistantSettingsPage } from '../features/settings/AssistantSettingsPage';
import { UsdaSettingsPage } from '../features/settings/UsdaSettingsPage';
import { DiaryPage } from '../features/diary/DiaryPage';
import { JournalPage } from '../features/journal/JournalPage';
import { RecipesPage } from '../features/recipes/RecipesPage';
import { RecipeEditor } from '../features/recipes/RecipeEditor';
import { RecipeView } from '../features/recipes/RecipeView';
import { NutrientPage } from '../features/nutrient/NutrientPage';
import { NutrientFoodsPage } from '../features/nutrient/NutrientFoodsPage';
import { FoodPage } from '../features/food/FoodPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ProfilePage } from '../features/settings/ProfilePage';
import { SunPage } from '../features/settings/SunPage';
import { DiagnosticsPage } from '../features/settings/DiagnosticsPage';
import { BackupPage, ExclusionsPage, NutrientVisibilityPage, SavedPage, StartPage } from '../features/settings/MorePages';
import { InsightsPage } from '../features/insights/InsightsPage';
import { Onboarding } from '../features/onboarding/Onboarding';

function Page({ route }: { route: string[] }) {
  const d = useData();
  const [a, b, c] = route;
  if (!d.profile.onboarded) return <Onboarding />;
  switch (a) {
    case 'log':
      return <LogPage key={`${b}-${c}`} day={b} foodCode={c} />;
    case 'assistant':
      return <AssistantPage key={b} day={b} />;
    case 'diary':
      return <DiaryPage day={b} />;
    case 'journal':
      return <JournalPage />;
    case 'insights':
      return <InsightsPage />;
    case 'recipes':
      if (b === 'new') return <RecipeEditor key="new" />;
      if (b && c === 'edit') return <RecipeEditor key={b} id={b} />;
      if (b) return <RecipeView id={b} />;
      return <RecipesPage />;
    case 'nutrient':
      if (c === 'foods') return <NutrientFoodsPage key={b} id={b ?? ''} />;
      return <NutrientPage id={b ?? ''} />;
    case 'food':
      return <FoodPage code={b ?? ''} />;
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
        default:
          return <SettingsPage />;
      }
    case 'about':
      return <AboutPage />;
    case 'calendar':
      return <CalendarPage month={b} />;
    case 'review':
      return <ReviewPage from={b} to={c} />;
    case 'fast':
      return <FastShortcut />;
    case 'sleep':
      return <SleepShortcut />;
    default:
      return <HomePage />;
  }
}

const NAV = [
  { key: 'home', to: [] as string[], icon: 'home', label: 'nav.home' },
  { key: 'diary', to: ['diary'], icon: 'diary', label: 'nav.diary' },
  { key: 'recipes', to: ['recipes'], icon: 'recipes', label: 'nav.recipes' },
  { key: 'settings', to: ['settings'], icon: 'settings', label: 'nav.settings' },
] as const;

export function App() {
  const route = useRoute();
  const section = route[0] === 'about' ? 'settings' : route[0] === 'insights' ? 'diary' : (route[0] ?? 'home');
  const active = NAV.some((n) => n.key === section) ? section : 'home';
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
