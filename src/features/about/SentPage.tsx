import { useData } from '../../app/data';
import { t, type MessageKey } from '../../i18n';
import { isOn } from '../../settings/features';
import type { FeatureKey } from '../../storage/types';
import { BackButton } from '../../ui/BackButton';

interface Flow {
  title: MessageKey;
  /** The feature that sends this; with several, all must be on. */
  feature: FeatureKey[];
  when: MessageKey;
  what: MessageKey[];
  not?: MessageKey;
  terms?: { text: MessageKey; links: Array<{ label: string; url: string }> };
}

const ANTHROPIC_TERMS = {
  text: 'sent.anthropicTerms',
  links: [
    { label: 'Commercial terms', url: 'https://www.anthropic.com/legal/commercial-terms' },
    { label: 'Privacy policy', url: 'https://www.anthropic.com/legal/privacy' },
  ],
} as const;

/** Every way data leaves the phone, in the order a user meets them; kept in step with docs/SPEC.md, "What leaves your phone". */
const FLOWS: Flow[] = [
  {
    title: 'sent.chatTitle',
    feature: ['aiAssistant'],
    when: 'sent.chatWhen',
    what: ['sent.chatWhat1', 'sent.chatWhat2', 'sent.chatWhat3', 'sent.chatWhat4', 'sent.chatWhat6', 'sent.chatWhat5'],
    not: 'sent.chatNot',
    terms: { text: ANTHROPIC_TERMS.text, links: [...ANTHROPIC_TERMS.links] },
  },
  {
    title: 'sent.patternsTitle',
    feature: ['aiAssistant', 'insights'],
    when: 'sent.patternsWhen',
    what: ['sent.patternsWhat'],
    not: 'sent.patternsNot',
    terms: { text: ANTHROPIC_TERMS.text, links: [...ANTHROPIC_TERMS.links] },
  },
  {
    title: 'sent.voiceTitle',
    feature: ['aiAssistant', 'voiceInput'],
    when: 'sent.voiceWhen',
    what: ['sent.voiceWhat'],
    not: 'sent.voiceNot',
    terms: { text: 'sent.openAiTerms', links: [{ label: 'Your data (OpenAI API)', url: 'https://developers.openai.com/api/docs/guides/your-data' }] },
  },
  { title: 'sent.offTitle', feature: ['openFoodFacts'], when: 'sent.offWhen', what: ['sent.offWhat'] },
  { title: 'sent.usdaTitle', feature: ['usda'], when: 'sent.usdaWhen', what: ['sent.usdaWhat'] },
];

/** What leaves the phone, to whom, and when: for anyone who wants to check before turning a feature on. Route: #/about/sent. */
export function SentPage() {
  const d = useData();
  return (
    <section className="sent-page">
      <header className="page-head row">
        <BackButton to={['about']} />
        <h1>{t('sent.title')}</h1>
      </header>
      <p>{t('sent.intro')}</p>
      {FLOWS.map((f) => {
        const on = f.feature.every((k) => isOn(d.settings.features, k));
        return (
          <article key={f.title} className="card sent-flow">
            <div className="row-between">
              <h2>{t(f.title)}</h2>
              {/* Said in words, not by colour. */}
              <span className={`status-chip${on ? ' sent-on' : ''}`}>{t(on ? 'sent.on' : 'sent.off')}</span>
            </div>
            <p className="small">{t(f.when)}</p>
            <h3 className="small">{t('sent.whatHeading')}</h3>
            <ul className="small">
              {f.what.map((w) => (
                <li key={w}>{t(w)}</li>
              ))}
            </ul>
            {f.not && (
              <>
                <h3 className="small">{t('sent.notHeading')}</h3>
                <p className="small">{t(f.not)}</p>
              </>
            )}
            {f.terms && (
              <p className="muted small">
                {t(f.terms.text)}{' '}
                {f.terms.links.map((l, i) => (
                  <span key={l.url}>
                    {i > 0 && ' · '}
                    <a href={l.url} target="_blank" rel="noreferrer">
                      {l.label}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </article>
        );
      })}
      <p className="small">{t('sent.keys')}</p>
      <p className="small">{t('sent.sources')}</p>
    </section>
  );
}
