import { useData } from '../../app/data';
import { phoneLanguage } from '../../app/language';
import { t } from '../../i18n';
import { repo } from '../../storage/repo';
import { Segmented } from '../../ui/controls';

/** UI language (owner's ask, 2026-11-19, for a German-speaking colleague): the phone's, English or German. */
export function LanguagePicker({ first }: { first?: boolean }) {
  const { settings } = useData();
  const value = settings.language ?? 'en';
  return (
    <>
      <p className={`muted small settings-label${first ? ' settings-label-first' : ''}`}>{t('settings.language')}</p>
      <Segmented
        label={t('settings.language')}
        value={value}
        onChange={(v) => void repo.updateSettings({ language: v })}
        options={[
          { value: 'auto', label: t('settings.languageAuto') },
          { value: 'en', label: t('language.en') },
          { value: 'de', label: t('language.de') },
        ]}
      />
      {value === 'auto' && <p className="muted small">{t('settings.languageAutoIs', { lang: t(`language.${phoneLanguage()}`) })}</p>}
    </>
  );
}
