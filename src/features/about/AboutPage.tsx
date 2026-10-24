import { href } from '../../app/router';
import { t } from '../../i18n';
import { useData } from '../../app/data';
import { applyUpdate, checkForUpdate, useAppUpdate } from '../../app/update';

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

      <h2>{t('about.cofidHeading')}</h2>
      <p>
        {t('about.cofid')}{' '}
        <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noreferrer">
          Open Government Licence v3.0
        </a>
        {' · '}
        <a href="https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid" target="_blank" rel="noreferrer">
          gov.uk
        </a>
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
      <p>
        <a href={href('about', 'sent')}>{t('about.sentLink')}</a>
      </p>

      <h2>{t('about.codeHeading')}</h2>
      <p>
        {t('about.code')}{' '}
        <a href="https://github.com/beitz/ToFoo" target="_blank" rel="noreferrer">
          github.com/beitz/ToFoo
        </a>
        .
      </p>
      <AppVersionInfo />
      <p className="muted">
        {t('about.dataVersion')}: BLS {d.foods.version} ({d.foods.foods.length.toLocaleString('en-GB')} foods)
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

/** Version, commit and build time, with a way to ask for a newer version (src/app/update.ts). */
function AppVersionInfo() {
  const u = useAppUpdate();
  const built = new Date(__APP_BUILT_AT__).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="app-version-info" id="version">
      <p className="muted">
        {t('about.version')}: <strong>{__APP_VERSION__}</strong>
        {__APP_COMMIT__ && (
          <>
            {' '}
            (
            <a href={`https://github.com/beitz/ToFoo/commit/${__APP_COMMIT__}`} target="_blank" rel="noreferrer">
              {__APP_COMMIT__}
            </a>
            )
          </>
        )}
        {' · '}
        {t('about.built', { when: built })}
      </p>
      <p className="muted small">{t('about.versionHow')}</p>
      <p>
        <a className="btn" href={href('about', 'versions')}>
          {t('about.history')}
        </a>
      </p>
      {u.status === 'ready' ? (
        <button type="button" className="btn btn-primary" onClick={applyUpdate}>
          {u.next ? t('version.readyNamed', { v: u.next }) : t('version.ready')} {t('version.tapToLoad')}
        </button>
      ) : (
        <p className="row app-version-check">
          <button type="button" className="btn" disabled={u.status === 'checking' || u.status === 'downloading'} onClick={() => void checkForUpdate()}>
            {u.status === 'checking' ? t('about.checking') : t('about.check')}
          </button>
          <span className="muted small" role="status">
            {u.status === 'current' && t('about.current')}
            {u.status === 'downloading' && t('about.downloading')}
            {u.status === 'unavailable' && t('about.unavailable')}
          </span>
        </p>
      )}
    </div>
  );
}
