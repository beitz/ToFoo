import { useMemo } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { checkNudge, foodCheck } from '../../logic/foodCheck';
import { isOn } from '../../settings/features';
import { AskChips } from '../../ui/AskChips';
import { Icon } from '../../ui/Icon';
import { useHomeRefs } from '../pantry/usePantry';

/**
 * Foods to check, at the bottom of Home (owner's ask, 2026-10-27: "accurate data with as little
 * friction as possible"): how many foods eaten or at home are not checked yet and how many of them
 * are worth a look, opening Check logged foods; with the assistant, a question that has it check
 * them with the food log and kitchen ticked (never sent by itself). Shown only while a food is
 * flagged or enough have piled up (checkNudge), so it doesn't sit there every day.
 */
export function CheckLine() {
  const d = useData();
  const home = useHomeRefs();
  const on = isOn(d.settings.features, 'checkNudge');
  const homeKey = JSON.stringify(home);
  const nudge = useMemo(() => {
    if (!on) return undefined;
    const first = d.log.reduce((a, e) => (e.day < a ? e.day : a), d.today);
    return checkNudge(foodCheck(d.log, d.batchesById, d.productsById, d.foods, first, d.today, d.settings, home));
    // `home` is new each render; its content (homeKey) is what counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, homeKey, d.log, d.batchesById, d.productsById, d.foods, d.today, d.settings.checkedFoods, d.settings.doubtedFoods]);
  if (!nudge) return null;
  const head = t(nudge.unchecked === 1 ? 'check.homeOne' : 'check.home', { n: nudge.unchecked });
  const look = nudge.flagged ? t('check.homeLook', { n: nudge.flagged }) : '';
  return (
    <div className="check-home" data-tour="home.check">
      <a className={nudge.flagged ? 'check-line check-line-flagged' : 'check-line'} href={href('settings', 'check')}>
        <Icon name={nudge.flagged ? 'warning' : 'search'} size={18} />
        <span className="grow">
          <strong>{head}</strong>
          {look && ` · ${look}`}
        </span>
        <Icon name="chevron" size={16} />
      </a>
      <AskChips questions={[t('check.askHome')]} data={{ kinds: ['food'], period: 'all', kitchen: true }} />
    </div>
  );
}
