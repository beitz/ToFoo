import type { ReactNode } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { needsCheck } from '../../foods/products';
import { FEATURE_GROUPS, FEATURES, isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Field, NumberInput, Segmented, Toggle } from '../../ui/controls';
import { AccentPicker } from './AccentPicker';
import { viewsOf } from '../../settings/views';
import { Icon } from '../../ui/Icon';

/** A settings section folded to its title (owner's ask, 2026-10-23: the page was a lot of scrolling); closed until tapped. */
function Fold({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <details className="card fold settings-fold">
      <summary>
        <span className="grow">
          <span className="settings-fold-title">{title}</span>
          {note && <span className="muted small block">{note}</span>}
        </span>
        <Icon name="down" size={18} />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

function LinkRow({ to, label, detail }: { to: string[]; label: string; detail?: string }) {
  return (
    <li>
      <a className="link-row" href={href(...to)}>
        <span>
          {label}
          {detail && <span className="muted small block">{detail}</span>}
        </span>
        <Icon name="chevron" size={18} />
      </a>
    </li>
  );
}

export function SettingsPage() {
  const d = useData();
  const s = d.settings;
  const views = viewsOf(s);
  const p = d.profile;
  const hiddenCount = s.hiddenNutrients.length;
  const toCheck = d.products.filter(needsCheck).length;
  return (
    <section>
      <header className="page-head">
        <h1>{t('settings.title')}</h1>
      </header>

      <ul className="link-list card">
        <LinkRow to={['settings', 'profile']} label={t('settings.profile')} detail={p.sex || p.birthYear || p.weightHistory.length ? t('settings.profileSet') : t('settings.profileDefaults')} />
        {isOn(s.features, 'sunVitaminD') && (
          <LinkRow to={['settings', 'sun']} label={t('settings.sun')} detail={p.outdoorRoutine ? t('settings.sunSet', { n: p.outdoorRoutine.length }) : t('settings.sunDefault')} />
        )}
        <LinkRow to={['settings', 'start']} label={t('settings.start')} detail={t(`start.${p.startingLevel}` as MessageKey)} />
        <LinkRow to={['settings', 'exclusions']} label={t('settings.exclusions')} detail={t('settings.exclusionsDetail', { n: p.exclusions.groups.length + p.exclusions.foods.length })} />
        <LinkRow to={['settings', 'nutrients']} label={t('settings.nutrients')} detail={hiddenCount ? t('settings.hidden', { n: hiddenCount }) : t('settings.allVisible')} />
        <LinkRow to={['settings', 'saved']} label={t('settings.saved')} detail={t('settings.savedDetail', { n: d.customFoods.length })} />
        {d.products.length > 0 && <LinkRow to={['settings', 'products']} label={t('match.title')} detail={toCheck ? t('match.settingsDetailCheck', { n: d.products.length, c: toCheck }) : t('match.settingsDetail', { n: d.products.length })} />}
        <LinkRow to={['settings', 'backup']} label={t('settings.backup')} detail={isOn(s.features, 'autoBackup') ? t('backup.linkOn') : t('backup.linkOff')} />
        <LinkRow to={['settings', 'assistant']} label={t('ai.settingsTitle')} detail={isOn(s.features, 'aiAssistant') ? t('ai.statusOn') : t('ai.statusOff')} />
        <LinkRow to={['settings', 'usda']} label={t('usda.heading')} detail={isOn(s.features, 'usda') ? t('ai.statusOn') : t('ai.statusOff')} />
      </ul>

      <h2 className="section-title">{t('settings.general')}</h2>
      <Fold title={t('settings.kitchen')}>
        <Toggle checked={p.salt.iodised} onChange={(v) => repo.updateProfile({ salt: { ...p.salt, iodised: v } })} label={t('settings.iodised')} />
        <Toggle checked={p.salt.fluoridated} onChange={(v) => repo.updateProfile({ salt: { ...p.salt, fluoridated: v } })} label={t('settings.fluoridated')} description={t('settings.saltHint')} />
      </Fold>

      <Fold title={t('settings.model')}>
        <Field label={t('settings.mealWindow')} hint={t('settings.mealWindowHint')}>
          {(id) => <NumberInput id={id} value={s.mealWindowMinutes} onChange={(v) => v && v >= 10 && repo.updateSettings({ mealWindowMinutes: Math.round(v) })} suffix="min" min={10} />}
        </Field>
        <div className="grid-2">
          <Field label={t('settings.shortWindow')}>
            {(id) => <NumberInput id={id} value={s.shortWindowDays} onChange={(v) => v && v >= 1 && repo.updateSettings({ shortWindowDays: Math.round(v) })} suffix={t('settings.days')} min={1} />}
          </Field>
          <Field label={t('settings.longWindow')}>
            {(id) => <NumberInput id={id} value={s.longWindowDays} onChange={(v) => v && v >= 1 && repo.updateSettings({ longWindowDays: Math.round(v) })} suffix={t('settings.days')} min={1} />}
          </Field>
        </div>
        <p className="muted small">{t('settings.windowHint')}</p>
      </Fold>

      <Fold title={t('settings.appearance')}>
        <p className="muted small settings-label settings-label-first">{t('settings.theme')}</p>
        <Segmented
          label={t('settings.theme')}
          value={s.theme}
          onChange={(v) => repo.updateSettings({ theme: v })}
          options={[
            { value: 'system', label: t('settings.themeSystem') },
            { value: 'light', label: t('settings.themeLight') },
            { value: 'dark', label: t('settings.themeDark') },
          ]}
        />
        <p className="muted small settings-label">{t('settings.macroView')}</p>
        <Segmented
          label={t('settings.macroView')}
          value={views.macros}
          onChange={(v) => repo.updateSettings({ macroView: v })}
          options={[
            { value: 'rings', label: t('settings.viewRings') },
            { value: 'bars', label: t('settings.viewBars') },
          ]}
        />
        <p className="muted small settings-label">{t('settings.nutrientView')}</p>
        <Segmented
          label={t('settings.nutrientView')}
          value={views.nutrients}
          onChange={(v) => repo.updateSettings({ nutrientView: v })}
          options={[
            { value: 'bars', label: t('settings.viewBars') },
            { value: 'comets', label: t('settings.viewComets') },
          ]}
        />
        <p className="muted small">{t('settings.viewsHint')}</p>
        <p className="muted small settings-label" id="accent-label">
          {t('settings.accent')}
        </p>
        <AccentPicker />
      </Fold>

      <h2 className="section-title">{t('settings.features')}</h2>
      {FEATURE_GROUPS.map((g) => {
        const list = FEATURES.filter((f) => f.group === g && !f.page);
        const ready = list.filter((f) => !f.comingIn);
        return (
        <Fold
          key={g}
          title={t(`settings.group.${g}` as MessageKey)}
          note={ready.length ? t('settings.groupOn', { n: ready.filter((f) => isOn(s.features, f.key)).length, of: ready.length }) : t('settings.groupLater', { n: list.length })}
        >
          {list.map((f) => (
            <div key={f.key} className={f.requires ? 'feature-sub' : undefined}>
              <Toggle
                checked={isOn(s.features, f.key)}
                disabled={!!f.comingIn || (!!f.requires && !isOn(s.features, f.requires))}
                onChange={(v) => repo.updateSettings({ features: { ...s.features, [f.key]: v } })}
                label={f.comingIn ? `${f.label} (${t('settings.comingIn', { v: f.comingIn })})` : f.label}
                description={f.description}
              />
            </div>
          ))}
        </Fold>
        );
      })}

      <ul className="link-list card">
        <LinkRow to={['about']} label={t('about.title')} />
        <LinkRow to={['settings', 'diagnostics']} label={t('diag.title')} detail={t('diag.linkDetail')} />
      </ul>
    </section>
  );
}
