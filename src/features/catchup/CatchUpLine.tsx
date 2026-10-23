import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays } from '../../lib/dates';
import { isOn } from '../../settings/features';
import { Icon } from '../../ui/Icon';
import { useCatchUp } from './useCatchUp';

/**
 * One line when a past day lacks something the user tracks (owner's ask, 2026-10-23): under Home's
 * day strip for yesterday ("Missing yesterday: meals, activity"), and at the top of any past day in
 * the diary. Tap opens the fill-in page for that day.
 */
export function CatchUpLine({ day: shown }: { day?: string }) {
  const d = useData();
  const day = shown ?? addDays(d.today, -1);
  const missing = useCatchUp(day);
  // Home's line follows "Ask about yesterday"; the diary always says what a past day lacks.
  if ((!shown && !isOn(d.settings.features, 'yesterdayNudge')) || day >= d.today || !missing?.length) return null;
  const lead = day === addDays(d.today, -1) ? 'catchUp.lineLead' : 'catchUp.lineLeadDay';
  const items = missing.map((k) => t(`catchUp.item.${k}` as MessageKey)).join(', ');
  return (
    <a className="catchup-line" href={href('catchup', day)} aria-label={`${t(lead)} ${items}. ${t('catchUp.go')}`}>
      <Icon name="history" size={18} />
      <span className="catchup-text" aria-hidden>
        <strong>{t(lead)}</strong> {items}
      </span>
      <Icon name="chevron" size={16} />
    </a>
  );
}
