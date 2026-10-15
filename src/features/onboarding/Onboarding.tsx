import { useState } from 'react';
import { useData } from '../../app/data';
import { t } from '../../i18n';
import type { StartingLevelChoice } from '../../model/simulate';
import { repo } from '../../storage/repo';
import { StartChoice } from '../settings/MorePages';

/** First launch: at most one optional screen (starting levels), then the dashboard. */
export function Onboarding() {
  const d = useData();
  const [choice, setChoice] = useState<StartingLevelChoice>(d.profile.startingLevel);
  const finish = (c: StartingLevelChoice) => repo.updateProfile({ startingLevel: c, onboarded: true });
  return (
    <section className="onboarding">
      <h1>{t('onboarding.title')}</h1>
      <p>{t('onboarding.intro')}</p>
      <h2 className="section-title">{t('onboarding.question')}</h2>
      <StartChoice value={choice} onChange={setChoice} />
      <p className="muted small">{t('onboarding.later')}</p>
      <div className="row">
        <button className="btn btn-primary" onClick={() => void finish(choice)}>
          {t('onboarding.continue')}
        </button>
        <button className="btn btn-ghost" onClick={() => void finish('average')}>
          {t('onboarding.skip')}
        </button>
      </div>
      <p className="muted small">{t('home.disclaimer')}</p>
    </section>
  );
}
