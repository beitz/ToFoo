import { href } from '../../app/router';
import { t } from '../../i18n';
import { SettingsButton } from '../../ui/SettingsButton';

export type InsightsView = 'overview' | 'diary' | 'calendar';

/**
 * The top of the Insights tab: Overview · Days · Calendar (owner's pick, 2026-10-23), the last two for
 * the day being looked at, and Settings at the right as on the other tabs.
 */
export function InsightsTabs({ view, day }: { view: InsightsView; day: string }) {
  const links: Array<{ view: InsightsView; to: string; label: string }> = [
    { view: 'overview', to: href('overview'), label: t('insightsTab.overview') },
    { view: 'diary', to: href('diary', day), label: t('insightsTab.diary') },
    { view: 'calendar', to: href('calendar', day.slice(0, 7)), label: t('insightsTab.calendar') },
  ];
  return (
    <div className="tab-top">
      <nav className="segmented tab-switch" aria-label={t('nav.insights')} data-tour="insights.tabs">
        {links.map((l) => (
          <a key={l.view} href={l.to} data-tour={l.view === 'diary' ? 'insights.days' : undefined} className={l.view === view ? 'on' : ''} aria-current={l.view === view ? 'page' : undefined}>
            {l.label}
          </a>
        ))}
      </nav>
      <SettingsButton />
    </div>
  );
}
