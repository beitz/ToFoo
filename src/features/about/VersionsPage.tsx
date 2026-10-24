import { useMemo, useState } from 'react';
import { t, type MessageKey } from '../../i18n';
import { en } from '../../i18n/en';
import { formatDay } from '../../lib/dates';
import { BackButton } from '../../ui/BackButton';
import { Segmented } from '../../ui/controls';
import { byDay, changeList, type Change } from './versionHistory';

type View = 'highlights' | 'all';

const majorKey = (c: Change) => `change.${c.pr}.major` as MessageKey;
const hasMajor = (c: Change) => majorKey(c) in en;

/**
 * What changed in each version (owner's ask 2026-10-24): the bigger changes at a glance, or every change a
 * user would notice with its version. Lines in src/i18n/changes.en.ts, versions and dates from git at build
 * time. Route: #/about/versions.
 */
export function VersionsPage() {
  const [view, setView] = useState<View>('highlights');
  const changes = useMemo(() => changeList(Object.keys(en), __APP_RELEASES__), []);
  // Without the git history (a local build) nothing has a version, so nothing is "coming next" either.
  const dated = changes.some((c) => c.date);
  const days = byDay(changes, view === 'highlights' ? hasMajor : undefined);
  return (
    <section className="versions-page">
      <header className="page-head row">
        <BackButton to={['about']} />
        <h1>{t('versions.title')}</h1>
      </header>
      <p className="muted small">{t('versions.yours', { v: __APP_VERSION__ })}</p>
      <Segmented
        label={t('versions.view')}
        value={view}
        onChange={setView}
        options={[
          { value: 'highlights', label: t('versions.highlights') },
          { value: 'all', label: t('versions.all') },
        ]}
      />
      {days.map((d) => (
        <article key={d.day ?? 'next'} className="card version-day">
          {(d.day || dated) && (
            <div className="row-between version-day-head">
              <h2>{d.day ? formatDay(d.day) : t('versions.next')}</h2>
              {d.first && <span className="muted small version-range">{d.first === d.last ? d.first : `${d.first} – ${d.last}`}</span>}
            </div>
          )}
          <ul className={view === 'all' ? 'version-list version-list-all' : 'version-list'}>
            {d.changes.map((c) =>
              view === 'highlights' ? (
                <li key={c.pr}>{t(majorKey(c))}</li>
              ) : (
                <li key={c.pr}>
                  {c.version ? (
                    <a
                      className="version-tag"
                      href={`https://github.com/beitz/ToFoo/pull/${c.pr}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t('versions.prLink', { v: c.version })}
                    >
                      {c.version}
                    </a>
                  ) : (
                    <span className="version-tag" />
                  )}
                  <span>{t(`change.${c.pr}` as MessageKey)}</span>
                </li>
              ),
            )}
          </ul>
        </article>
      ))}
      <p className="muted small">{t('versions.leftOut')}</p>
    </section>
  );
}
