import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { newId } from '../../lib/id';
import { CONTAINER_AMOUNTS, CONTAINER_DRINKS, containerDrinkKey, containerMl, MAX_CONTAINER_ML, withContainer, withoutContainer } from '../../logic/drinks';
import { MAX_WATER_ML } from '../../logic/water';
import { repo } from '../../storage/repo';
import type { DrinkContainer, WaterRecord } from '../../storage/types';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { TimeField } from '../log/TimeField';
import { containerAmountText, drinkName, lengthText, logContainer, logFinished, sinceForTap } from './containers';
import { useWaterRecords } from './useWater';
import { lastFromContainer, MAX_SPREAD_DAYS, spreadProblem } from '../../logic/spread';
import { formatDateTime } from '../../lib/dates';
import { waterText } from './format';

const PRESETS = [150, 250, 330, 500, 750, 1000];
const DAY_MS = 86_400_000;

/** Problem with an amount of water, or undefined if it is fine. */
export function waterProblem(ml: number | undefined): string | undefined {
  if (!ml || ml <= 0) return t('water.problem.empty');
  if (ml > MAX_WATER_ML) return t('water.problem.much');
  return undefined;
}

/** Log plain water now (or at `time`), with undo. */
export async function addWaterWithUndo(ml: number, time: number, toast: ReturnType<typeof useToast>) {
  const added = await repo.addWater({ ml, time, day: dayKey(new Date(time)) });
  toast(t('water.added', { amount: waterText(ml) }), () => void repo.deleteWater(added.id));
}

/** "¼", "½", "1", "1½", "2": parts of a container as chips. */
function amountLabel(a: number): string {
  const whole = Math.floor(a);
  const part = a - whole;
  const frac = part === 0.25 ? '¼' : part === 0.5 ? '½' : part === 0.75 ? '¾' : part ? fmtNumber(part, 2) : '';
  return whole ? `${whole}${frac}` : frac;
}

type Mode = { kind: 'log' } | { kind: 'containers' } | { kind: 'edit'; container?: DrinkContainer };

/**
 * Add a drink (at `defaultTime`) from one of the user's containers (a whole one, half, …) or as an
 * amount of plain water; set up the containers; or edit or delete a water entry, with undo.
 */
export function WaterSheet({ record, defaultTime, container, onClose }: { record?: WaterRecord; defaultTime: number; container?: string; onClose: () => void }) {
  if (record) return <PlainWater record={record} defaultTime={defaultTime} onClose={onClose} />;
  return <DrinkSheet defaultTime={defaultTime} container={container} onClose={onClose} />;
}

/** One sheet whose content changes (one layer for the back button): add a drink, the containers, one container. */
function DrinkSheet({ defaultTime, container, onClose }: { defaultTime: number; container?: string; onClose: () => void }) {
  const d = useData();
  const containers = d.settings.drinkContainers ?? [];
  const [mode, setMode] = useState<Mode>({ kind: 'log' });
  const title = mode.kind === 'containers' ? t('drinks.containersTitle') : mode.kind === 'edit' ? t(mode.container ? 'drinks.editTitle' : 'drinks.newTitle') : t('drinks.addTitle');
  return (
    <Sheet title={title} onClose={onClose}>
      {mode.kind === 'containers' ? (
        <>
          <ContainerList containers={containers} onEdit={(c) => setMode({ kind: 'edit', container: c })} />
          <p className="muted small">{t('drinks.listHint')}</p>
          <div className="sheet-actions">
            <button className="btn btn-secondary" onClick={() => setMode({ kind: 'edit' })}>
              {t('drinks.add')}
            </button>
            <button className="btn btn-primary" onClick={() => setMode({ kind: 'log' })}>
              {t('drinks.back')}
            </button>
          </div>
        </>
      ) : mode.kind === 'edit' ? (
        <ContainerForm key={mode.container?.id ?? 'new'} container={mode.container} containers={containers} onDone={(added) => setMode(added && containers.length === 0 ? { kind: 'log' } : { kind: 'containers' })} />
      ) : (
        <AddDrink containers={containers} defaultTime={defaultTime} initial={container} onSetUp={() => setMode(containers.length ? { kind: 'containers' } : { kind: 'edit' })} onClose={onClose} />
      )}
    </Sheet>
  );
}

/** Log from a container or an amount of plain water. */
function AddDrink({ containers, defaultTime, initial, onSetUp, onClose }: { containers: DrinkContainer[]; defaultTime: number; initial?: string; onSetUp: () => void; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const stored = useWaterRecords();
  // Unpicked: the first container (also one just added, before the settings have reloaded).
  const [pick, setPick] = useState<string | undefined>(initial);
  const [amount, setAmount] = useState(1);
  const [ml, setMl] = useState<number | undefined>(250);
  const [time, setTime] = useState(defaultTime);
  // When a container logged empty was filled; undefined until picked (or its last finish, when recent).
  const [from, setFrom] = useState<{ container: string; time: number | undefined } | undefined>();
  const container = pick === 'plain' ? undefined : (containers.find((c) => c.id === pick) ?? containers[0]);
  const finishing = !!container?.whenEmpty;
  const last = container && stored ? lastFromContainer(container.id, stored, d.log, time) : undefined;
  const since = container && from?.container === container.id ? from.time : container && stored ? sinceForTap(container, stored, d.log, time) : undefined;
  const spread = finishing && since !== undefined ? spreadProblem(since, time) : undefined;
  const problem =
    (container ? waterProblem(containerMl(container, amount)) : waterProblem(ml)) ??
    (time > Date.now() + 60_000 ? t('water.problem.future') : undefined) ??
    (finishing ? (since === undefined ? t('drinks.problem.since') : spread === 'order' ? t('drinks.problem.order') : spread === 'long' ? t('drinks.problem.long', { n: MAX_SPREAD_DAYS }) : undefined) : undefined);

  async function save() {
    if (problem) return;
    if (container && finishing && since !== undefined) await logFinished(container, amount, time, since, d.foods, toast);
    else if (container) await logContainer(container, amount, time, d.foods, toast);
    else if (ml) await addWaterWithUndo(Math.round(ml), time, toast);
    onClose();
  }
  const setSince = (v: number) => container && setFrom({ container: container.id, time: v });

  return (
    <>
      {containers.length > 0 && (
        <div className="chips" role="group" aria-label={t('drinks.containersTitle')}>
          {containers.map((c) => (
            <button key={c.id} type="button" className={`chip${container?.id === c.id ? ' on' : ''}`} aria-pressed={container?.id === c.id} onClick={() => setPick(c.id)}>
              {c.name} · {waterText(c.ml)}
            </button>
          ))}
          <button type="button" className={`chip${!container ? ' on' : ''}`} aria-pressed={!container} onClick={() => setPick('plain')}>
            {t('drinks.otherAmount')}
          </button>
        </div>
      )}
      {container ? (
        <>
          <div className="chips" role="group" aria-label={t('drinks.howMuch')}>
            {CONTAINER_AMOUNTS.filter((a) => !finishing || a <= 1).map((a) => (
              <button key={a} type="button" className={`chip${amount === a ? ' on' : ''}`} aria-pressed={amount === a} onClick={() => setAmount(a)}>
                {amountLabel(a)}
              </button>
            ))}
          </div>
          <p className="drink-amount">{containerAmountText(container, amount, d.foods)}</p>
          {finishing && <SinceChoice since={since} last={last} time={time} ml={containerMl(container, amount)} onChange={setSince} />}
        </>
      ) : (
        <>
          <div className="chips" role="group" aria-label={t('water.presets')}>
            {PRESETS.map((p) => (
              <button key={p} type="button" className={`chip${ml === p ? ' on' : ''}`} aria-pressed={ml === p} onClick={() => setMl(p)}>
                {waterText(p)}
              </button>
            ))}
          </div>
          <Field label={t('water.amount')}>{(id) => <NumberInput id={id} value={ml} onChange={setMl} suffix="ml" min={0} />}</Field>
          <p className="muted small">{t('water.plainHint')}</p>
        </>
      )}
      <TimeField value={time} onChange={setTime} label={finishing ? t('drinks.finishedAt') : undefined} />
      {problem && (
        <p className="notice small" role="alert">
          {problem}
        </p>
      )}
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={onSetUp}>
          {t(containers.length ? 'drinks.containersTitle' : 'drinks.setUp')}
        </button>
        <button className="btn btn-primary" disabled={!!problem} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </>
  );
}

/**
 * When a container now empty was filled: its last finish, or a day or more before; the fill time one
 * tap away. Below, how the amount is spread ("Over 2 days 4 h: about 940 ml a day").
 */
function SinceChoice({ since, last, time, ml, onChange }: { since: number | undefined; last: number | undefined; time: number; ml: number; onChange: (t: number) => void }) {
  const choices = [
    ...(last !== undefined && time - last <= MAX_SPREAD_DAYS * DAY_MS ? [{ key: 'last', value: last, label: t('drinks.sinceLast', { when: formatDateTime(last) }) }] : []),
    ...[1, 2, 3].map((n) => ({ key: String(n), value: time - n * DAY_MS, label: t(n === 1 ? 'drinks.sinceOneDay' : 'drinks.sinceDays', { n }) })),
  ];
  const perDay = since !== undefined && time - since >= DAY_MS ? (ml * DAY_MS) / (time - since) : undefined;
  return (
    <>
      <h3 className="section-title">{t('drinks.since')}</h3>
      <div className="chips" role="group" aria-label={t('drinks.since')}>
        {choices.map((c) => (
          <button key={c.key} type="button" className={`chip${since === c.value ? ' on' : ''}`} aria-pressed={since === c.value} onClick={() => onChange(c.value)}>
            {c.label}
          </button>
        ))}
      </div>
      {since !== undefined && <TimeField value={since} onChange={onChange} label={t('drinks.filledAt')} />}
      <p className="muted small">
        {since !== undefined && since < time ? `${perDay !== undefined ? t('drinks.spreadPerDay', { length: lengthText(since, time), amount: waterText(perDay) }) : t('drinks.spreadShort', { length: lengthText(since, time) })} ` : ''}
        {t('drinks.spreadHint')}
      </p>
    </>
  );
}

/** The containers, one row each; a tap opens it to change. */
function ContainerList({ containers, onEdit }: { containers: DrinkContainer[]; onEdit: (c: DrinkContainer) => void }) {
  const d = useData();
  if (!containers.length) return <p className="muted">{t('drinks.none')}</p>;
  return (
    <ul className="plain-list pot-list">
      {containers.map((c) => (
        <li key={c.id}>
          <button type="button" className="pot-choice" onClick={() => onEdit(c)} aria-label={t('drinks.editOne', { name: c.name })}>
            <span className="grow">
              {c.name}
              <span className="muted small"> · {drinkName(c, d.foods)}{c.whenEmpty ? ` · ${t('drinks.whenEmptyShort')}` : ''}</span>
            </span>
            <strong>{waterText(c.ml)}</strong>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Add or change a container: name, size when full, and what it holds. */
function ContainerForm({ container, containers, onDone }: { container?: DrinkContainer; containers: DrinkContainer[]; onDone: (added: boolean) => void }) {
  const d = useData();
  const toast = useToast();
  const [name, setName] = useState(container?.name ?? '');
  const [ml, setMl] = useState<number | undefined>(container?.ml);
  const [drink, setDrink] = useState<string>(container ? containerDrinkKey(container) : 'water');
  const [whenEmpty, setWhenEmpty] = useState(!!container?.whenEmpty);
  const problem = !name.trim() ? t('drinks.problem.name') : !ml || !(ml > 0) ? t('drinks.problem.size') : ml > MAX_CONTAINER_ML ? t('drinks.problem.big') : undefined;

  async function save() {
    if (problem || !ml) return;
    const code = CONTAINER_DRINKS.find((x) => x.key === drink)?.code;
    // A drink no longer offered ('other') keeps its food.
    const ref = drink === 'other' ? container?.drink : code ? { source: 'BLS' as const, version: d.foods.version, code } : undefined;
    await repo.updateSettings({ drinkContainers: withContainer(containers, { id: container?.id ?? newId(), name, ml, ...(ref ? { drink: ref } : {}), ...(whenEmpty ? { whenEmpty } : {}) }) });
    onDone(!container);
  }

  async function remove() {
    if (!container) return;
    const { list, index } = withoutContainer(containers, container.id);
    await repo.updateSettings({ drinkContainers: list });
    toast(t('drinks.deleted', { name: container.name }), async () => {
      const now = (await repo.getSettings())?.drinkContainers ?? [];
      const back = now.filter((c) => c.id !== container.id);
      back.splice(index, 0, container);
      await repo.updateSettings({ drinkContainers: back });
    });
    onDone(false);
  }

  const options: Array<{ key: string; label: string }> = [
    { key: 'water', label: t('drinks.water') },
    ...CONTAINER_DRINKS.map((x) => ({ key: x.key, label: t(`drinks.${x.key}`) })),
    ...(drink === 'other' && container ? [{ key: 'other', label: drinkName(container, d.foods) }] : []),
  ];

  return (
    <>
      <div className="grid-2">
        <Field label={t('drinks.name')}>{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('drinks.namePlaceholder')} />}</Field>
        <Field label={t('drinks.size')}>{(id) => <NumberInput id={id} value={ml} onChange={setMl} suffix="ml" min={0} placeholder="1000" />}</Field>
      </div>
      <p className="muted small">{t('drinks.sizeHint')}</p>
      <h3 className="section-title">{t('drinks.holds')}</h3>
      <div className="chips" role="group" aria-label={t('drinks.holds')}>
        {options.map((o) => (
          <button key={o.key} type="button" className={`chip${drink === o.key ? ' on' : ''}`} aria-pressed={drink === o.key} onClick={() => setDrink(o.key)}>
            {o.label.charAt(0).toUpperCase() + o.label.slice(1)}
          </button>
        ))}
      </div>
      <p className="muted small">{t(drink === 'water' ? 'drinks.holdsWater' : 'drinks.holdsDrink')}</p>
      <h3 className="section-title">{t('drinks.logWhen')}</h3>
      <div className="chips" role="group" aria-label={t('drinks.logWhen')}>
        {([false, true] as const).map((v) => (
          <button key={String(v)} type="button" className={`chip${whenEmpty === v ? ' on' : ''}`} aria-pressed={whenEmpty === v} onClick={() => setWhenEmpty(v)}>
            {t(v ? 'drinks.logEmpty' : 'drinks.logEach')}
          </button>
        ))}
      </div>
      <p className="muted small">{t(whenEmpty ? 'drinks.logEmptyHint' : 'drinks.logEachHint')}</p>
      {problem && (name || ml !== undefined) && (
        <p className="notice small" role="alert">
          {problem}
        </p>
      )}
      <div className="sheet-actions">
        {container ? (
          <button className="btn btn-ghost" onClick={() => void remove()}>
            {t('common.delete')}
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={() => onDone(false)}>
            {t('common.cancel')}
          </button>
        )}
        <button className="btn btn-primary" disabled={!!problem} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </>
  );
}

/** Edit or delete a plain water entry, with undo. */
function PlainWater({ record, defaultTime, onClose }: { record: WaterRecord; defaultTime: number; onClose: () => void }) {
  const toast = useToast();
  const [ml, setMl] = useState<number | undefined>(record.ml);
  const [time, setTime] = useState(record.time ?? defaultTime);
  // A container logged empty: when it was filled (the amount counts evenly from then to `time`).
  const [from, setFrom] = useState(record.from);
  const spread = from !== undefined ? spreadProblem(from, time) : undefined;
  const problem = waterProblem(ml) ?? (time > Date.now() + 60_000 ? t('water.problem.future') : undefined) ?? (spread === 'order' ? t('drinks.problem.order') : spread === 'long' ? t('drinks.problem.long', { n: MAX_SPREAD_DAYS }) : undefined);

  async function save() {
    if (problem || !ml) return;
    await repo.updateWater({ ...record, ml: Math.round(ml), time, day: dayKey(new Date(time)), ...(from !== undefined ? { from } : {}) });
    toast(t('water.updated'), () => repo.restoreWater(record));
    onClose();
  }

  async function remove() {
    const old = await repo.deleteWater(record.id);
    if (old) toast(t('water.deleted'), () => repo.restoreWater(old));
    onClose();
  }

  return (
    <Sheet title={t('water.editTitle')} onClose={onClose}>
      <div className="chips" role="group" aria-label={t('water.presets')}>
        {PRESETS.map((p) => (
          <button key={p} type="button" className={`chip${ml === p ? ' on' : ''}`} aria-pressed={ml === p} onClick={() => setMl(p)}>
            {waterText(p)}
          </button>
        ))}
      </div>
      <Field label={t('water.amount')}>{(id) => <NumberInput id={id} value={ml} onChange={setMl} suffix="ml" min={0} />}</Field>
      {from !== undefined && <TimeField value={from} onChange={setFrom} label={t('drinks.filledAt')} />}
      <TimeField value={time} onChange={setTime} label={from !== undefined ? t('drinks.finishedAt') : undefined} />
      <p className="muted small">{from !== undefined && from < time ? `${t('drinks.spreadShort', { length: lengthText(from, time) })} ${t('drinks.spreadHint')}` : t('water.plainHint')}</p>
      {problem && (
        <p className="notice small" role="alert">
          {problem}
        </p>
      )}
      <div className="sheet-actions">
        <button className="btn btn-ghost" onClick={() => void remove()}>
          {t('common.delete')}
        </button>
        <button className="btn btn-primary" disabled={!!problem} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
