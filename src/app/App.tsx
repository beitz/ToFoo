import { useRoute, href } from './router';
import { t } from '../i18n';
import { AboutPage } from '../features/about/AboutPage';
import { HomePage } from '../features/home/HomePage';

export function App() {
  const route = useRoute();
  const page = route[0] ?? 'home';

  return (
    <div className="app">
      <main className="page">{page === 'about' ? <AboutPage /> : <HomePage />}</main>
      <nav className="bottom-nav" aria-label="Main">
        <a href={href()} aria-current={page === 'home' ? 'page' : undefined}>
          {t('nav.home')}
        </a>
        <a href={href('about')} aria-current={page === 'about' ? 'page' : undefined}>
          {t('nav.settings')}
        </a>
      </nav>
    </div>
  );
}
