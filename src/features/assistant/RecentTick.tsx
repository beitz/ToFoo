import { href } from '../../app/router';
import { t } from '../../i18n';
import { Icon } from '../../ui/Icon';

/**
 * Recent days in the composer (docs/SPEC.md, "Recent days and changing saved entries"): its own
 * tick box, ticked by default once the feature is on, untickable for one chat. Once a message went
 * with the days, one line says the chat holds them.
 */
export function RecentTick({ n, ticked, onTick, sent }: { n: number; ticked: boolean; onTick: (v: boolean) => void; sent: boolean }) {
  if (sent) {
    return (
      <p className="composer-note data-shared small" role="status" data-tour="assistant.recent">
        <Icon name="history" size={16} />
        <span className="grow">{t(n === 1 ? 'recent.sentOne' : 'recent.sent', { n })}</span>
      </p>
    );
  }
  return (
    <div className="composer-note recent-tick small" data-tour="assistant.recent">
      <label className="radio-row grow">
        <input type="checkbox" checked={ticked} onChange={(e) => onTick(e.target.checked)} /> {t(n === 1 ? 'recent.tickOne' : 'recent.tick', { n })}
      </label>
      <a className="muted" href={href('about', 'sent')}>
        {t('sent.more')}
      </a>
    </div>
  );
}
