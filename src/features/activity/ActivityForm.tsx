import { useId } from 'react';
import { useData } from '../../app/data';
import { t, type MessageKey } from '../../i18n';
import { MAX_ACTIVITY_MINUTES } from '../../logic/activity';
import type { SkinExposure } from '../../model/sun';
import { isOn } from '../../settings/features';
import { ACTIVITY_KINDS, INTENSITIES, type ActivityKind, type ActivityRecord, type Intensity } from '../../storage/types';
import { Field, NumberInput, Segmented, Toggle } from '../../ui/controls';
import { TimeField } from '../log/TimeField';
import { SkinSelect } from '../settings/SkinSelect';

/** An activity being entered or checked: like a record, with the amount possibly still empty. */
export interface ActivityDraft {
  kind: ActivityKind;
  name: string;
  time: number;
  minutes: number | undefined;
  intensity: Intensity;
  outside: boolean;
  /** Counts toward the sun estimate (when outside). */
  sun: boolean;
  skin: SkinExposure;
}

/** Skin showing on a walk when nothing else is known: the outdoor routine's default (model/parameters.ts). */
export const DEFAULT_ACTIVITY_SKIN: SkinExposure = 'faceHands';

export function draftOf(a: ActivityRecord): ActivityDraft {
  return { kind: a.kind, name: a.name ?? '', time: a.time, minutes: a.minutes, intensity: a.intensity ?? 'moderate', outside: a.outside, sun: !!a.sunSkin, skin: a.sunSkin ?? DEFAULT_ACTIVITY_SKIN };
}

/** The record fields of a draft, or a problem to show instead. */
export function recordOf(d: ActivityDraft, now = Date.now()): { ok: true; fields: Omit<ActivityRecord, 'id' | 'schemaVersion' | 'day'> } | { ok: false; problem: string } {
  if (!d.minutes || d.minutes <= 0) return { ok: false, problem: t('activity.problem.minutes') };
  if (d.minutes > MAX_ACTIVITY_MINUTES) return { ok: false, problem: t('activity.problem.long') };
  if (d.time > now + 60_000) return { ok: false, problem: t('activity.problem.future') };
  const name = d.name.trim();
  return {
    ok: true,
    fields: {
      kind: d.kind,
      ...(name ? { name } : {}),
      time: d.time,
      minutes: Math.round(d.minutes),
      intensity: d.intensity,
      outside: d.outside,
      ...(d.outside && d.sun ? { sunSkin: d.skin } : {}),
    },
  };
}

/** "Walk", or the user's own name for it. */
export function activityName(a: { kind: ActivityKind; name?: string }): string {
  return a.name?.trim() || t(`activity.kind.${a.kind}` as MessageKey);
}

/** What, when, how long, how hard, outside: the fields shared by the diary sheet and the assistant's card. */
export function ActivityForm({ draft, onChange }: { draft: ActivityDraft; onChange: (d: ActivityDraft) => void }) {
  const skinId = useId();
  // Skin and sun questions only matter while the sun estimate is on (owner's ask, 2026-10-23).
  const sunOn = isOn(useData().settings.features, 'sunVitaminD');
  const set = (patch: Partial<ActivityDraft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <Segmented<ActivityKind>
        label={t('activity.what')}
        className="segmented-grid"
        value={draft.kind}
        onChange={(kind) => set({ kind })}
        options={ACTIVITY_KINDS.map((k) => ({ value: k, label: t(`activity.kind.${k}` as MessageKey) }))}
      />
      <Field label={t('activity.name')}>
        {(id) => <input id={id} type="text" value={draft.name} placeholder={t('activity.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}
      </Field>
      <TimeField label={t('activity.started')} value={draft.time} onChange={(time) => set({ time })} />
      <Field label={t('activity.minutes')}>{(id) => <NumberInput id={id} value={draft.minutes} onChange={(minutes) => set({ minutes })} suffix="min" min={0} />}</Field>
      <Segmented<Intensity>
        label={t('activity.howHard')}
        value={draft.intensity}
        onChange={(intensity) => set({ intensity })}
        options={INTENSITIES.map((i) => ({ value: i, label: t(`activity.intensity.${i}` as MessageKey) }))}
      />
      <Toggle checked={draft.outside} onChange={(outside) => set({ outside })} label={t('activity.outside')} />
      {draft.outside && sunOn && (
        <>
          <Toggle checked={draft.sun} onChange={(sun) => set({ sun })} label={t('activity.sun')} description={t('activity.sunHint')} />
          {draft.sun && <SkinSelect id={skinId} value={draft.skin} onChange={(skin) => set({ skin })} />}
        </>
      )}
    </>
  );
}
