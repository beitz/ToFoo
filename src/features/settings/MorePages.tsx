import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t, type MessageKey } from '../../i18n';
import { search } from '../../foods/search';
import { fmtPercent } from '../../lib/format';
import { formatDay } from '../../lib/dates';
import { shareOrDownload } from '../../lib/shareFile';
import { NUTRIENT_GROUPS, NUTRIENTS, type NutrientDef } from '../../model/nutrients';
import { storage } from '../../../model/parameters';
import type { BackupFile } from '../../exchange/schema';
import type { Snapshot } from '../../storage/repo';
import { repo } from '../../storage/repo';
import type { StartingLevelChoice } from '../../model/simulate';
import { Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { SubPage } from './ProfilePage';

// ── Starting levels ──

export function StartPage() {
  const d = useData();
  const p = d.profile;
  // Slow stores show their daily balance; their starting level only matters before a blood test.
  const tanks = NUTRIENTS.filter((n) => (storage[n.id]?.kind === 'tank' || storage[n.id]?.kind === 'tankDays') && d.model.nutrients.get(n.id)?.kind === 'tank');
  return (
    <SubPage title={t('settings.start')}>
      <p className="muted small">{t('start.intro')}</p>
      <StartChoice value={p.startingLevel} onChange={(v) => repo.updateProfile({ startingLevel: v })} />
      {p.startingLevel === 'custom' && (
        <div className="card">
          {tanks.map((n) => {
            const v = p.customStartLevels?.[n.id] ?? 0.5;
            return (
              <div className="field" key={n.id}>
                <label htmlFor={`start-${n.id}`}>
                  {n.name}: {fmtPercent(v)}
                </label>
                <input
                  id={`start-${n.id}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={v}
                  onChange={(e) => repo.updateProfile({ customStartLevels: { ...p.customStartLevels, [n.id]: Number(e.target.value) } })}
                />
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">{t('start.bloodTest')}</p>
    </SubPage>
  );
}

export function StartChoice({ value, onChange }: { value: StartingLevelChoice; onChange: (v: StartingLevelChoice) => void }) {
  const options: StartingLevelChoice[] = ['empty', 'average', 'custom'];
  return (
    <div className="choice-list" role="radiogroup" aria-label={t('settings.start')}>
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={value === o} className={`choice${value === o ? ' on' : ''}`} onClick={() => onChange(o)}>
          <strong>{t(`start.${o}` as MessageKey)}</strong>
          <span className="small">{t(`start.${o}Pro` as MessageKey)}</span>
          <span className="small muted">{t(`start.${o}Con` as MessageKey)}</span>
        </button>
      ))}
    </div>
  );
}

// ── Food exclusions ──

export function ExclusionsPage() {
  const d = useData();
  const ex = d.profile.exclusions;
  const [query, setQuery] = useState('');
  const results = useMemo(() => (query.trim() ? search(d.searchIndex, query, { limit: 10, boost: d.searchBoost }) : []), [query, d.searchIndex, d.searchBoost]);
  const save = (patch: Partial<typeof ex>) => repo.updateProfile({ exclusions: { ...ex, ...patch } });
  return (
    <SubPage title={t('settings.exclusions')}>
      <p className="muted small">{t('exclusions.intro')}</p>
      <h2 className="section-title">{t('exclusions.groups')}</h2>
      <div className="card">
        {Object.entries(d.foods.groups).map(([letter, g]) => (
          <Toggle
            key={letter}
            checked={ex.groups.includes(letter)}
            onChange={(v) => save({ groups: v ? [...ex.groups, letter] : ex.groups.filter((x) => x !== letter) })}
            label={g.en}
            description={g.de}
          />
        ))}
      </div>
      <h2 className="section-title">{t('exclusions.foods')}</h2>
      <ul className="plain-list card">
        {ex.foods.length === 0 && <li className="muted">{t('exclusions.none')}</li>}
        {ex.foods.map((code) => (
          <li key={code} className="row-between">
            <span>{d.foods.byCode.get(code)?.nameEn ?? code}</span>
            <button className="icon-btn" aria-label={t('common.delete')} onClick={() => save({ foods: ex.foods.filter((x) => x !== code) })}>
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="search-box">
        <Icon name="search" />
        <input type="search" placeholder={t('exclusions.add')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('exclusions.add')} />
      </div>
      <ul className="result-list">
        {results.map((r) => (
          <li key={r.key}>
            <button
              className="result"
              onClick={() => {
                if (!ex.foods.includes(r.key)) void save({ foods: [...ex.foods, r.key] });
                setQuery('');
              }}
            >
              <span className="result-name">{r.nameEn}</span>
              <span className="muted small">{r.nameDe}</span>
            </button>
          </li>
        ))}
      </ul>
    </SubPage>
  );
}

// ── Nutrient visibility tree ──

interface TreeNode {
  id: string;
  label: string;
  children: TreeNode[];
  nutrients: NutrientDef[];
}

function buildTree(): TreeNode[] {
  const root: TreeNode = { id: '', label: '', children: [], nutrients: [] };
  for (const n of NUTRIENTS) {
    let node = root;
    for (const g of n.path) {
      let child = node.children.find((c) => c.id === g);
      if (!child) {
        child = { id: g, label: NUTRIENT_GROUPS[g] ?? g, children: [], nutrients: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.nutrients.push(n);
  }
  return root.children;
}

function allIds(node: TreeNode): string[] {
  return [...node.nutrients.map((n) => n.id), ...node.children.flatMap(allIds)];
}

export function NutrientVisibilityPage() {
  const d = useData();
  const hidden = new Set(d.settings.hiddenNutrients);
  const tree = useMemo(buildTree, []);
  const setHidden = (ids: string[], hide: boolean) => {
    const next = new Set(hidden);
    for (const id of ids) {
      if (hide) next.add(id);
      else next.delete(id);
    }
    void repo.updateSettings({ hiddenNutrients: [...next] });
  };
  const renderNode = (node: TreeNode, depth: number) => {
    const ids = allIds(node);
    const visible = ids.filter((id) => !hidden.has(id)).length;
    return (
      <details key={node.id} open={depth === 0} className={`tree depth-${depth}`}>
        <summary>
          <span>{node.label}</span>
          <label className="tree-switch" onClick={(e) => e.stopPropagation()}>
            <span className="muted small">
              {visible}/{ids.length}
            </span>
            <input type="checkbox" role="switch" className="switch" checked={visible > 0} aria-label={node.label} onChange={(e) => setHidden(ids, !e.target.checked)} />
          </label>
        </summary>
        {node.nutrients.map((n) => (
          <Toggle key={n.id} checked={!hidden.has(n.id)} onChange={(v) => setHidden([n.id], !v)} label={n.name} />
        ))}
        {node.children.map((c) => renderNode(c, depth + 1))}
      </details>
    );
  };
  return (
    <SubPage title={t('settings.nutrients')}>
      <p className="muted small">{t('visibility.intro')}</p>
      <div className="row">
        <button className="btn btn-small" onClick={() => void repo.updateSettings({ hiddenNutrients: [] })}>
          {t('visibility.showAll')}
        </button>
      </div>
      <div className="card">{tree.map((n) => renderNode(n, 0))}</div>
    </SubPage>
  );
}

// ── Saved foods and supplements ──

export function SavedPage() {
  const d = useData();
  const toast = useToast();
  return (
    <SubPage title={t('settings.saved')}>
      {d.customFoods.length === 0 && <p className="muted">{t('saved.empty')}</p>}
      <ul className="plain-list card">
        {d.customFoods.map((c) => (
          <li key={c.id} className="row-between">
            <span>
              {c.isSupplement && <Icon name="pill" size={14} />} {c.name} <span className="muted small">· {c.servingLabel}</span>
            </span>
            <button
              className="icon-btn"
              aria-label={t('common.delete')}
              onClick={async () => {
                await repo.deleteCustomFood(c.id);
                toast(t('saved.deleted', { name: c.name }), () => void repo.db.customFoods.put(c));
              }}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small">{t('saved.hint')}</p>
    </SubPage>
  );
}

// ── Backup ──

export function BackupPage() {
  const toast = useToast();
  const lastBackup = useLiveQuery(() => repo.getMeta<string>('lastBackupDay'), []);
  const d = useData();
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [summary, setSummary] = useState<Array<[string, number]>>([]);
  const [error, setError] = useState<string>();
  const [paste, setPaste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // Preload the exchange module so sharing stays within the tap's user activation.
  useEffect(() => void import('../../exchange/parse'), []);

  async function exportAll() {
    const now = new Date();
    const { buildBackup, backupFileName } = await import('../../exchange/parse');
    const file = buildBackup(await repo.snapshot(), __APP_VERSION__, now);
    try {
      await shareOrDownload(backupFileName(now), JSON.stringify(file, null, 1));
      await repo.setMeta('lastBackupDay', d.today);
      toast(t('backup.done'));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(t('backup.failed'));
    }
  }

  async function readText(text: string) {
    setError(undefined);
    // Loaded on demand: the validator is only needed here.
    const { parseExchange, backupSummary } = await import('../../exchange/parse');
    const res = parseExchange(text);
    if (!res.ok) return setError(res.error);
    if (res.value.type !== 'backup') return setError(t('backup.notBackup'));
    setSummary(backupSummary(res.value));
    setPending(res.value);
  }

  async function restore() {
    if (!pending) return;
    const before = await repo.snapshot();
    await repo.restore(pending.data as Snapshot);
    setPending(null);
    toast(t('backup.restored'), () => void repo.restore(before));
  }

  return (
    <SubPage title={t('settings.backup')}>
      <div className="card">
        <p>{t('backup.intro')}</p>
        <p className="muted small">{lastBackup ? t('backup.last', { day: formatDay(lastBackup, d.today) }) : t('backup.never')}</p>
        <button className="btn btn-primary btn-block" onClick={() => void exportAll()}>
          <Icon name="download" /> {t('backup.export')}
        </button>
      </div>
      <h2 className="section-title">{t('backup.import')}</h2>
      <div className="card">
        <p className="muted small">{t('backup.importIntro')}</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await readText(await f.text());
            e.target.value = '';
          }}
        />
        <button className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" /> {t('backup.chooseFile')}
        </button>
        <details>
          <summary className="small">{t('backup.pasteInstead')}</summary>
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label={t('backup.pasteInstead')} />
          <button className="btn btn-small" disabled={!paste.trim()} onClick={() => void readText(paste)}>
            {t('backup.check')}
          </button>
        </details>
        {error && (
          <div className="error-box" role="alert">
            <strong>{t('backup.invalid')}</strong>
            <pre>{error}</pre>
          </div>
        )}
        {pending && (
          <div className="preview">
            <p>
              <strong>{t('backup.preview', { date: new Date(pending.exportedAt).toLocaleString('en-GB') })}</strong>
            </p>
            <ul className="plain-list small">
              {summary.map(([label, n]) => (
                <li key={label} className="row-between">
                  <span>{label}</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
            <p className="notice small">{t('backup.replaceWarning')}</p>
            <div className="row">
              <button className="btn btn-primary" onClick={() => void restore()}>
                {t('backup.restore')}
              </button>
              <button className="btn btn-ghost" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </SubPage>
  );
}
