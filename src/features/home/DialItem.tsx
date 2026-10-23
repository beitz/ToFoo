import { Icon } from '../../ui/Icon';

/**
 * One quick action in the Home button's menu: its name next to a small round button, both one tap
 * target. A pinned one stays visible while the menu is closed (its name shows only when open).
 */
export function DialItem({ icon, label, on, pinned, tour, onClick }: { icon: string; label: string; on?: boolean; pinned?: boolean; tour?: string; onClick: () => void }) {
  return (
    <button className={`dial-item${on ? ' on' : ''}${pinned ? ' dial-pinned' : ''}`} data-tour={tour} onClick={onClick} aria-pressed={pinned ? undefined : on} aria-label={pinned ? label : undefined}>
      <span className="dial-label">{label}</span>
      <span className="fab fab-small" aria-hidden>
        <Icon name={icon} />
      </span>
    </button>
  );
}
