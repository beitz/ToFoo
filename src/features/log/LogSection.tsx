import type { ReactNode } from 'react';
import { useData } from '../../app/data';
import { repo } from '../../storage/repo';
import { Icon } from '../../ui/Icon';

/**
 * A log screen section behind a tappable heading. Open or closed is remembered per section in the
 * settings, so a section the user never uses stays out of the way on every visit.
 */
export function LogSection({ id, title, count, icon, children }: { id: string; title: string; count?: number; icon?: ReactNode; children: ReactNode }) {
  const { settings } = useData();
  const collapsed = settings.logCollapsed?.[id] ?? false;
  const toggle = () => void repo.updateSettings({ logCollapsed: { ...settings.logCollapsed, [id]: !collapsed } });
  return (
    <div className="log-section">
      <button className="fold-head" aria-expanded={!collapsed} aria-controls={`log-${id}`} onClick={toggle}>
        <span className={collapsed ? 'chev' : 'chev chev-open'} aria-hidden>
          <Icon name="chevron" size={16} />
        </span>
        {icon}
        <span className="fold-title">
          {title} {count !== undefined && <span className="fold-count">{count}</span>}
        </span>
      </button>
      {!collapsed && <div id={`log-${id}`}>{children}</div>}
    </div>
  );
}
