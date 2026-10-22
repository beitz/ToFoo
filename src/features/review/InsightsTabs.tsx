import { href } from '../../app/router';
import { t } from '../../i18n';
import { weekStart } from '../../lib/periods';
import { SettingsButton } from '../../ui/SettingsButton';

export type InsightsView = 'diary' | 'week' | 'calendar';

/**
 * The top of the Insights tab: Diary · Week · Calendar, each for the day being looked at, and
 * Settings at the right as on the other tabs.
 */
export function InsightsTabs({ view, day }: { view: InsightsView; day: string }) {
  const links: Array<{ view: InsightsView; to: string; label: string }> = [
    { view: 'diary', to: href('diary', day), label: t('insightsTab.diary') },
    { view: 'week', to: href('week', weekStart(day)), label: t('insightsTab.week') },
    { view: 'calendar', to: href('calendar', day.slice(0, 7)), label: t('insightsTab.calendar') },
  ];
  return (
    <div className="tab-top">
      <nav className="segmented tab-switch" aria-label={t('nav.insights')}>
        {links.map((l) => (
          <a key={l.view} href={l.to} className={l.view === view ? 'on' : ''} aria-current={l.view === view ? 'page' : undefined}>
            {l.label}
          </a>
        ))}
      </nav>
      <SettingsButton />
    </div>
  );
}
