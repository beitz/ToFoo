import { Icon } from '../../ui/Icon';

/** One quick action in the Home button's menu: its name next to a small round button, both one tap target. */
export function DialItem({ icon, label, on, onClick }: { icon: string; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button className={`dial-item${on ? ' on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="dial-label">{label}</span>
      <span className="fab fab-small" aria-hidden>
        <Icon name={icon} />
      </span>
    </button>
  );
}
