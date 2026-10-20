import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { NUTRIENTS } from '../../model/nutrients';
import { isOn } from '../../settings/features';
import { storeNeedsAttention, withStores } from '../../logic/stores';
import { StoreRow } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';

/** The body stores (iron, B12, vitamin A, folate, iodine, vitamin D): how full each is and where it is heading. */
export function StoresPage() {
  const d = useData();
  const showRange = isOn(d.settings.features, 'uncertaintyRanges');
  const hidden = new Set(d.settings.hiddenNutrients);
  const stores = withStores(NUTRIENTS.filter((n) => !hidden.has(n.id)).map((n) => d.model.nutrients.get(n.id)!).filter(Boolean));
  // The ones that need a look first; otherwise the usual nutrient order.
  const sorted = [...stores.filter((r) => storeNeedsAttention(r.store)), ...stores.filter((r) => !storeNeedsAttention(r.store))];
  return (
    <section>
      <header className="page-head row">
        <a className="icon-btn" href={href()} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{t('stores.title')}</h1>
      </header>
      <p className="muted small">
        {t('stores.intro', { start: t(`start.${d.profile.startingLevel}` as MessageKey) })}{' '}
        <a href={href('settings', 'start')}>{t('stores.changeStart')}</a>
      </p>
      <div className="nrow-list">
        {sorted.map((r) => (
          <StoreRow key={r.id} result={r} showRange={showRange} onClick={() => navigate('nutrient', r.id)} />
        ))}
      </div>
      <p className="muted small">{t('stores.slowNote')}</p>
      {sorted.some((r) => storeNeedsAttention(r.store)) && <p className="muted small">{t('stores.warnNote')}</p>}
    </section>
  );
}
