import { href } from '../../app/router';
import { t } from '../../i18n';
import { useData } from '../../app/data';

export const BLS_CITATION =
  'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe.';
export const BLS_DOI = '10.25826/Data20251217-134202-0';

export function AboutPage() {
  const d = useData();
  return (
    <section className="prose">
      <h1>{t('about.title')}</h1>
      <p>{t('about.intro')}</p>

      <h2>{t('about.blsHeading')}</h2>
      <p>
        {BLS_CITATION} DOI:{' '}
        <a href={`https://doi.org/${BLS_DOI}`} target="_blank" rel="noreferrer">
          {BLS_DOI}
        </a>
      </p>
      <p>
        {t('about.licence')}:{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        . {t('about.blsConverted')}
      </p>

      <h2>{t('about.offHeading')}</h2>
      <p>
        {t('about.off')}{' '}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
          openfoodfacts.org
        </a>
        {' · '}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">
          ODbL
        </a>
      </p>

      <h2>{t('about.usdaHeading')}</h2>
      <p>
        {t('about.usda')}{' '}
        <a href="https://fdc.nal.usda.gov" target="_blank" rel="noreferrer">
          fdc.nal.usda.gov
        </a>
        {' · '}
        <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">
          CC0 1.0
        </a>
      </p>

      <h2>{t('about.modelHeading')}</h2>
      <p>{t('about.model')}</p>

      <h2>{t('about.privacyHeading')}</h2>
      <p>{t('about.privacy')}</p>

      <h2>{t('about.codeHeading')}</h2>
      <p>
        {t('about.code')}{' '}
        <a href="https://github.com/beitz/ToFoo" target="_blank" rel="noreferrer">
          github.com/beitz/ToFoo
        </a>
        .
      </p>
      <p className="muted">
        {t('about.version')}: {__APP_VERSION__} · {t('about.dataVersion')}: BLS {d.foods.version} ({d.foods.foods.length.toLocaleString('en-GB')} foods)
      </p>
      <p className="muted small">
        <a href="https://github.com/beitz/ToFoo/blob/main/docs/OPEN_QUESTIONS.md" target="_blank" rel="noreferrer">
          {t('about.openQuestions')}
        </a>
        {' · '}
        <a href={href('settings', 'diagnostics')}>{t('diag.title')}</a>
      </p>
    </section>
  );
}
