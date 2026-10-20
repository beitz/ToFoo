/**
 * One-page explanations of a nutrient group (vitamins, minerals, protein, fats, carbohydrates),
 * opened from an ⓘ next to the group's name. Texts are sourced summaries (src/i18n/groupInfo.en.ts);
 * every number on the page is computed from BLS or taken from model/ with its source.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { GROUP_INFO_SOURCES } from '../../i18n/groupInfo.en';
import { fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID, NUTRIENTS } from '../../model/nutrients';
import { aminoAcidPattern } from '../../../model/reference-values';
import { fatSoluble, preparationRetention, retentionClassOf, storage } from '../../../model/parameters';
import { aminoProfiles, FAT_EXAMPLES, fatProfile, PROTEIN_KINDS } from '../../foods/groupStats';
import { EAA_IDS } from '../../i18n/nutrientInfo.en';
import { Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { nutrientType } from '../home/grouping';
import { fmtDuration } from '../../ui/duration';

export const INFO_GROUPS = ['protein', 'fat', 'carbs', 'vitamins', 'minerals'] as const;
export type InfoGroup = (typeof INFO_GROUPS)[number];

export function hasGroupInfo(id: string): id is InfoGroup {
  return (INFO_GROUPS as readonly string[]).includes(id);
}

/** The group's name, as Home's "By type" headings show it. */
export function groupTitle(group: InfoGroup): string {
  return t(`home.group.type.${group}` as MessageKey);
}

/** Small ⓘ button that opens the group's info page. */
export function GroupInfoButton({ group }: { group: InfoGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn info-btn" aria-label={t('ginfo.open', { group: groupTitle(group).toLowerCase() })} onClick={() => setOpen(true)}>
        <Icon name="info" size={20} />
      </button>
      {open && createPortal(<GroupInfoSheet group={group} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** "About vitamins" as a text button, for places with room for a label. */
export function GroupInfoLink({ group }: { group: InfoGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen(true)}>
        <Icon name="info" size={18} /> {t('ginfo.open', { group: groupTitle(group).toLowerCase() })}
      </button>
      {open && createPortal(<GroupInfoSheet group={group} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

export function GroupInfoSheet({ group, onClose }: { group: InfoGroup; onClose: () => void }) {
  const body = {
    protein: <ProteinInfo onNavigate={onClose} />,
    fat: <FatInfo onNavigate={onClose} />,
    carbs: <CarbsInfo />,
    vitamins: <MicroInfo group="vitamins" onNavigate={onClose} />,
    minerals: <MicroInfo group="minerals" onNavigate={onClose} />,
  }[group];
  return (
    <Sheet title={groupTitle(group)} onClose={onClose}>
      <div className="group-info small">
        {body}
        <Sources group={group} />
      </div>
    </Sheet>
  );
}

const m = (key: string) => t(key as MessageKey);

/** "Saturated: mostly from …" with the part before the colon in bold. */
function Labelled({ text }: { text: string }) {
  const i = text.indexOf(': ');
  if (i < 0 || i > 40) return <>{text}</>;
  return (
    <>
      <strong>{text.slice(0, i)}:</strong> {text.slice(i + 2)}
    </>
  );
}

function Vegan({ text }: { text: string }) {
  return (
    <p>
      <strong>{t('ginfo.vegan')}:</strong> {text}
    </p>
  );
}

function Sources({ group }: { group: InfoGroup }) {
  return (
    <>
      <h3>{t('ginfo.sources')}</h3>
      <ul className="group-info-sources muted">
        {GROUP_INFO_SOURCES[group]!.map((s) => (
          <li key={s.url + s.label}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function NutrientLink({ id, onNavigate, children }: { id: string; onNavigate: () => void; children?: ReactNode }) {
  return (
    <a href={href('nutrient', id)} onClick={onNavigate}>
      {children ?? NUTRIENT_BY_ID.get(id)?.name ?? id}
    </a>
  );
}

const EAA_ORDER = NUTRIENTS.filter((n) => EAA_IDS.has(n.id)).map((n) => n.id);

function ProteinInfo({ onNavigate }: { onNavigate: () => void }) {
  const d = useData();
  const profiles = useMemo(() => aminoProfiles(d.foods.foods, EAA_ORDER), [d.foods]);
  const count = Object.fromEntries(profiles.map((p) => [p.kind, p.foods]));
  const colKey = { grains: 'ginfo.protein.colGrains', legumes: 'ginfo.protein.colLegumes', nuts: 'ginfo.protein.colNuts', animal: 'ginfo.protein.colAnimal' } as const;
  return (
    <>
      <p>{t('ginfo.protein.intro')}</p>
      <h3>{t('ginfo.protein.classes')}</h3>
      {(['essential', 'conditional', 'dispensable'] as const).map((c) => (
        <p key={c}>
          <strong>{m(`ginfo.protein.${c}`)}:</strong> {m(`ginfo.protein.${c}List`)}
          <br />
          <span className="muted">{m(`ginfo.protein.${c}Why`)}</span>
        </p>
      ))}
      <p className="muted">{t('ginfo.protein.histidineNote')}</p>

      <h3>{t('ginfo.protein.roles')}</h3>
      <ul className="group-info-list">
        {EAA_ORDER.map((id) => (
          <li key={id}>
            <NutrientLink id={id} onNavigate={onNavigate} />: {m(`aaRole.${id}`)}
          </li>
        ))}
      </ul>

      <h3>{t('ginfo.protein.plantAnimal')}</h3>
      <p>{t('ginfo.protein.tableIntro')}</p>
      <div className="table-scroll">
        <table className="nutrient-table group-info-table">
          <thead>
            <tr>
              <th scope="col" />
              {PROTEIN_KINDS.map((k) => (
                <th scope="col" key={k.id} className="num">
                  {t(colKey[k.id])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EAA_ORDER.map((id) => {
              const need = aminoAcidPattern.value[id];
              return (
                <tr key={id}>
                  <th scope="row">{NUTRIENT_BY_ID.get(id)?.short ?? id}</th>
                  {profiles.map((p) => {
                    const v = p.mgPerG[id];
                    const ratio = v !== undefined && need ? v / need : undefined;
                    const below = ratio !== undefined && ratio < 1;
                    return (
                      <td key={p.kind} className={below ? 'num below' : 'num'}>
                        {ratio === undefined ? '–' : fmtPercent(ratio)}
                        {below && (
                          <>
                            {' '}
                            <span aria-hidden>↓</span>
                            <span className="visually-hidden">{t('ginfo.protein.below')}</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">{t('ginfo.protein.tableNote', { grains: count.grains ?? 0, legumes: count.legumes ?? 0, nuts: count.nuts ?? 0, animal: count.animal ?? 0 })}</p>
      <p>{t('ginfo.protein.combine')}</p>
      <Vegan text={t('ginfo.protein.vegan')} />
    </>
  );
}

function FatInfo({ onNavigate }: { onNavigate: () => void }) {
  const d = useData();
  const rows = FAT_EXAMPLES.map((code) => d.foods.byCode.get(code)).filter((f) => !!f);
  const pct = (v: number | undefined) => (v === undefined ? '–' : fmtPercent(v));
  return (
    <>
      <p>{t('ginfo.fat.intro')}</p>
      <h3>{t('ginfo.fat.kinds')}</h3>
      <ul className="group-info-list">
        <li>
          <Labelled text={t('ginfo.fat.sat')} />
        </li>
        <li>
          <Labelled text={t('ginfo.fat.mono')} />
        </li>
        <li>
          <Labelled text={t('ginfo.fat.poly')} />
        </li>
        <li>
          <Labelled text={t('ginfo.fat.epadha')} />
        </li>
      </ul>
      <h3>{t('ginfo.fat.table')}</h3>
      <p>{t('ginfo.fat.tableIntro')}</p>
      <div className="table-scroll">
        <table className="nutrient-table group-info-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" className="num">
                {t('ginfo.fat.colSat')}
              </th>
              <th scope="col" className="num">
                {t('ginfo.fat.colMono')}
              </th>
              <th scope="col" className="num">
                {t('ginfo.fat.colPoly')}
              </th>
              <th scope="col" className="num">
                {t('ginfo.fat.colN3')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const p = fatProfile(f);
              return (
                <tr key={f.code}>
                  <th scope="row">
                    <a href={href('food', f.code)} onClick={onNavigate}>
                      {f.nameEn}
                    </a>
                  </th>
                  <td className="num">{pct(p.saturated)}</td>
                  <td className="num">{pct(p.mono)}</td>
                  <td className="num">{pct(p.poly)}</td>
                  <td className="num">{pct(p.omega3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>{t('ginfo.fat.after')}</p>
      <Vegan text={t('ginfo.fat.vegan')} />
    </>
  );
}

function CarbsInfo() {
  return (
    <>
      <p>{t('ginfo.carbs.intro')}</p>
      <h3>{t('ginfo.carbs.where')}</h3>
      <p>{t('ginfo.carbs.whereText')}</p>
      <h3>{t('ginfo.carbs.fibre')}</h3>
      <p>{t('ginfo.carbs.fibreText')}</p>
      <p className="muted">{t('ginfo.carbs.sugarNote')}</p>
    </>
  );
}

/** Retention class → the nutrient it is shown as on the vitamins page. */
const RETENTION_SHOWN: Record<string, string> = { vitC: 'VITC', folate: 'FOL', thiamin: 'THIA', riboflavin: 'RIBF', niacin: 'NIAEQ', b6: 'VITB6', b12: 'VITB12', vitA: 'VITAA' };

function MicroInfo({ group, onNavigate }: { group: 'vitamins' | 'minerals'; onNavigate: () => void }) {
  const d = useData();
  const ids = NUTRIENTS.filter((n) => nutrientType(n.id) === group).map((n) => n.id);
  const isStore = (id: string) => !!storage[id] && storage[id]!.kind !== 'rolling';
  const name = (id: string) => NUTRIENT_BY_ID.get(id)?.name ?? id;
  return (
    <>
      {group === 'vitamins' ? (
        <>
          <p>{t('ginfo.vitamins.intro')}</p>
          <ul className="group-info-list">
            <li>
              <Labelled text={t('ginfo.vitamins.fat', { g: fatSoluble.thresholdFatG.value.central })} />
            </li>
            <li>
              <Labelled text={t('ginfo.vitamins.water')} />
            </li>
          </ul>
          <p>{t('ginfo.vitamins.stores', { list: ids.filter(isStore).map(name).join(', ') })}</p>
          <h3>{t('ginfo.vitamins.made')}</h3>
          <ul className="group-info-list">
            <li>
              <Labelled text={t('ginfo.vitamins.madeD')} />
            </li>
            <li>
              <Labelled text={t('ginfo.vitamins.madeNiacin')} />
            </li>
            <li>
              <Labelled text={t('ginfo.vitamins.madeA')} />
            </li>
          </ul>
        </>
      ) : (
        <>
          <p>{t('ginfo.minerals.intro')}</p>
          <ul className="group-info-list">
            <li>
              <Labelled text={t('ginfo.minerals.major')} />
            </li>
            <li>
              <Labelled text={t('ginfo.minerals.trace')} />
            </li>
          </ul>
          <h3>{t('ginfo.minerals.absorption')}</h3>
          <ul className="group-info-list">
            <li>
              <Labelled text={t('ginfo.minerals.absHeme')} />
            </li>
            <li>
              <Labelled text={t('ginfo.minerals.absHelp')} />
            </li>
            <li>
              <Labelled text={t('ginfo.minerals.absHinder')} />
            </li>
          </ul>
          <p>{t('ginfo.minerals.absModel')}</p>
        </>
      )}

      <h3>{m(`ginfo.${group}.table`)}</h3>
      <div className="table-scroll">
        <table className="nutrient-table group-info-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">{t('ginfo.mostlyFrom')}</th>
              <th scope="col" className="num">
                {t('ginfo.store')}
              </th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const r = d.model.nutrients.get(id);
              const days = r && r.kind === 'tank' ? r.storeDays?.central : undefined;
              return (
                <tr key={id}>
                  <th scope="row">
                    <NutrientLink id={id} onNavigate={onNavigate}>
                      {NUTRIENT_BY_ID.get(id)?.short ?? id}
                    </NutrientLink>
                  </th>
                  <td>{m(`ginfo.from.${id}`)}</td>
                  <td className="num">{days ? fmtDuration(days) : t('ginfo.storeNone')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">{t('ginfo.storeNote')}</p>

      {group === 'vitamins' ? (
        <>
          <h3>{t('ginfo.vitamins.cooking')}</h3>
          <p>{t('ginfo.vitamins.cookingText', { list: boiledRetentionText() })}</p>
          <Vegan text={t('ginfo.vitamins.vegan')} />
        </>
      ) : (
        <>
          <p>{t('ginfo.minerals.salt')}</p>
          <Vegan text={t('ginfo.minerals.vegan')} />
        </>
      )}
    </>
  );
}

/** "B1 60%, B6 65%, …": what boiling keeps, least kept first (central USDA factors from model/). */
function boiledRetentionText(): string {
  const boiled = preparationRetention.value.boiled;
  return Object.entries(RETENTION_SHOWN)
    .flatMap(([cls, id]) => {
      const r = boiled[cls as keyof typeof boiled];
      return r && retentionClassOf[id] === cls ? [{ id, keep: r.central }] : [];
    })
    .sort((a, b) => a.keep - b.keep)
    .map((x) => `${NUTRIENT_BY_ID.get(x.id)?.short ?? x.id} ${fmtPercent(x.keep)}`)
    .join(', ');
}
