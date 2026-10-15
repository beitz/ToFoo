import { useEffect } from 'react';
import { useRoute, href } from './router';
import { t } from '../i18n';
import { DataProvider, useData } from './data';
import { ToastProvider } from './toast';
import { ErrorBoundary } from './ErrorBoundary';
import { Icon } from '../ui/Icon';
import { AboutPage } from '../features/about/AboutPage';
import { HomePage } from '../features/home/HomePage';
import { LogPage } from '../features/log/LogPage';
import { DiaryPage } from '../features/diary/DiaryPage';
import { RecipesPage } from '../features/recipes/RecipesPage';
import { RecipeEditor } from '../features/recipes/RecipeEditor';
import { RecipeView } from '../features/recipes/RecipeView';
import { NutrientPage } from '../features/nutrient/NutrientPage';
import { FoodPage } from '../features/food/FoodPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ProfilePage } from '../features/settings/ProfilePage';
import { SunPage } from '../features/settings/SunPage';
import { BackupPage, ExclusionsPage, NutrientVisibilityPage, SavedPage, StartPage } from '../features/settings/MorePages';
import { Onboarding } from '../features/onboarding/Onboarding';

function Page({ route }: { route: string[] }) {
  const d = useData();
  const [a, b, c] = route;
  if (!d.profile.onboarded) return <Onboarding />;
  switch (a) {
    case 'log':
      return <LogPage key={`${b}-${c}`} day={b} foodCode={c} />;
    case 'diary':
      return <DiaryPage day={b} />;
    case 'recipes':
      if (b === 'new') return <RecipeEditor key="new" />;
      if (b && c === 'edit') return <RecipeEditor key={b} id={b} />;
      if (b) return <RecipeView id={b} />;
      return <RecipesPage />;
    case 'nutrient':
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
        default:
          return <SettingsPage />;
      }
    case 'about':
      return <AboutPage />;
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
  const section = route[0] === 'about' ? 'settings' : (route[0] ?? 'home');
  const active = NAV.some((n) => n.key === section) ? section : 'home';
  useEffect(() => window.scrollTo(0, 0), [route.join('/')]);

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
              <ErrorBoundary key={route.join('/')} showHome={route.length > 0}>
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
