import { useState } from 'react';
import { labMarkers } from '../../../model/parameters';
import { useData } from '../../app/data';
import { t, type MessageKey } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { newId } from '../../lib/id';
import { repo } from '../../storage/repo';
import { NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { DateInput } from '../../ui/DateInputs';

/** Blood test markers that set this nutrient's store. */
export const markersFor = (id: string) => Object.entries(labMarkers).filter(([, m]) => m.value.nutrient === id);

/** Enter and list blood test values for a nutrient; the latest one sets the store on its day. */
export function BloodTests({ id, folded = false }: { id: string; folded?: boolean }) {
  const d = useData();
  const markers = markersFor(id);
  const [marker, info] = markers[0] ?? [];
  const [value, setValue] = useState<number>();
  const [day, setDay] = useState(d.today);
  if (!marker || !info) return null;
  const results = (d.profile.labResults ?? []).filter((r) => r.marker === marker).sort((a, b) => b.day.localeCompare(a.day));
  const save = () => {
    if (value === undefined || !day) return;
    void repo.updateProfile({
      labResults: [...(d.profile.labResults ?? []), { id: newId(), marker, value, day }],
    });
    setValue(undefined);
  };
  const remove = (rid: string) =>
    repo.updateProfile({
      labResults: (d.profile.labResults ?? []).filter((r) => r.id !== rid),
    });
  const name = t(`lab.${marker}` as MessageKey);
  const latest = results[0];
  const content = (
    <>
      <p className="small muted">{t('lab.intro', { name: name.toLowerCase() })}</p>
      {results.length > 0 && (
        <ul className="plain-list">
          {results.map((r) => (
            <li key={r.id} className="row-between">
              <span>
                {name} {fmtNumber(r.value, 1)} {info.value.unit} · {formatDay(r.day, d.today)}
              </span>
              <button className="icon-btn" aria-label={t('common.delete')} onClick={() => void remove(r.id)}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="prompt-row">
        <NumberInput value={value} onChange={setValue} placeholder={name} suffix={info.value.unit} min={0} />
        <DateInput value={day} max={d.today} onChange={(e) => setDay(e.target.value)} aria-label={t('lab.day')} />
        <button className="btn btn-small btn-primary" disabled={value === undefined || !day} onClick={save}>
          {t('common.save')}
        </button>
      </div>
      {info.note && <p className="small muted">{t(`lab.${marker}Note` as MessageKey)}</p>}
    </>
  );
  if (folded)
    return (
      <details className="card fold">
        <summary>
          <Icon name="drop" size={18} />
          <span className="grow">{t('lab.foldTitle', { name })}</span>
          {latest && (
            <span className="muted small">
              {fmtNumber(latest.value, 1)} {info.value.unit} · {formatDay(latest.day, d.today)}
            </span>
          )}
          <Icon name="down" size={16} />
        </summary>
        <div className="fold-body">{content}</div>
      </details>
    );
  return (
    <>
      <h2 className="section-title">{t('lab.title')}</h2>
      <div className="card">{content}</div>
    </>
  );
}
