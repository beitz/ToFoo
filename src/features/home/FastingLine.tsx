import { href } from '../../app/router';
import { t } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { fmtFastDuration, PHASE_KEY, useFast } from '../fast/useFast';

/** The running-fast line on Home: hours since the last meal and, with the module on, the likely ketosis phase. Opens the fast page. */
export function FastingLine() {
  const f = useFast();
  if (!f) return null;
  const duration = fmtFastDuration(f.input.hours);
  return (
    <a className="home-fasting" href={href('fasting')}>
      <Icon name="moon" size={16} />
      <span>
        {f.clock.fromMeal ? t('fast.line', { duration }) : t('fast.lineAtLeast', { duration })}
        {f.estimate && <span className="home-fasting-ketosis"> · {t(PHASE_KEY[f.estimate.phase])}</span>}
      </span>
      <Icon name="chevron" size={16} />
    </a>
  );
}
