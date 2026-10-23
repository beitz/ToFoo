import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays } from '../../lib/dates';
import { isOn } from '../../settings/features';
import { Icon } from '../../ui/Icon';
import { useCatchUp } from './useCatchUp';

/**
 * One line under Home's day strip when yesterday lacks something the user tracks (owner's ask,
 * 2026-10-23): "Missing yesterday: meals, activity". Tap opens the catch-up page.
 */
export function CatchUpLine() {
  const d = useData();
  const day = addDays(d.today, -1);
  const missing = useCatchUp(day);
  if (!isOn(d.settings.features, 'yesterdayNudge') || !missing?.length) return null;
  const items = missing.map((k) => t(`catchUp.item.${k}` as MessageKey)).join(', ');
  return (
    <a className="catchup-line" href={href('catchup', day)} aria-label={`${t('catchUp.line', { items })}. ${t('catchUp.go')}`}>
      <Icon name="history" size={18} />
      <span className="catchup-text" aria-hidden>
        <strong>{t('catchUp.lineLead')}</strong> {items}
      </span>
      <Icon name="chevron" size={16} />
    </a>
  );
}
