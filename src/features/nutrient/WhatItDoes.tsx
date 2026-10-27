import { useState } from "react";
import { createPortal } from "react-dom";
import { useData } from "../../app/data";
import { t, type MessageKey } from "../../i18n";
import { infoId } from "../../i18n/nutrientInfo.en";
import { fmtAmount, fmtNumber, fmtPercent } from "../../lib/format";
import { NUTRIENT_BY_ID } from "../../model/nutrients";
import type { Range, Sex } from "../../model/paramTypes";
import { tankCapacityRange } from "../../model/simulate";
import { Sheet } from "../../ui/controls";
import { fmtDuration } from "../../ui/duration";
import { Icon } from "../../ui/Icon";
import { bodyMakes, turnover } from "../../../model/nutrientFacts";
import {
  nutrientParams,
  preparationRetention,
  retentionClassOf,
  storage,
} from "../../../model/parameters";

/**
 * The roles in "What it does", one icon each, in the order of `does.<key>.<n>` (src/i18n/does.en.ts).
 * A test checks that every key has as many texts as icons.
 */
export const ROLE_ICONS: Record<string, string[]> = {
  ENERCC: ["bolt", "sun", "activity"],
  PROT625: ["muscle", "cell", "shield", "repeat"],
  EAA: ["muscle"],
  FAT: ["bolt", "swap", "drop"],
  FASAT: ["bolt"],
  "F18:2CN6": ["cell", "skin", "nerve"],
  "F18:3CN3": ["leaf", "swap"],
  EPADHA: ["brain", "eye", "heart"],
  CHO: ["brain", "muscle"],
  SUGAR: ["bolt"],
  FIBT: ["gut", "cell", "hourglass"],
  VITAA: ["eye", "skin", "shield"],
  VITD: ["bone", "muscle"],
  VITE: ["spark", "cell"],
  VITK: ["bleed", "bone"],
  THIA: ["bolt", "nerve", "heart"],
  RIBF: ["bolt", "repeat"],
  NIAEQ: ["bolt"],
  PANTAC: ["bolt", "drop"],
  VITB6: ["muscle", "brain", "drop"],
  BIOT: ["bolt"],
  FOL: ["dna", "drop", "baby"],
  VITB12: ["nerve", "drop", "dna"],
  VITC: ["skin", "shield", "spark", "swap"],
  NA: ["drop", "gauge", "nerve"],
  CLD: ["drop", "gut"],
  K: ["nerve", "heart", "gauge"],
  CA: ["bone", "tooth", "muscle", "bleed"],
  MG: ["cell", "bolt", "muscle", "bone"],
  P: ["bone", "dna", "bolt"],
  FE: ["drop", "muscle"],
  ZN: ["shield", "skin", "person", "mouth"],
  ID: ["thyroid", "gauge", "baby"],
  SE: ["spark", "thyroid", "shield"],
  CU: ["bolt", "joint", "drop"],
  MN: ["bone", "bolt", "spark"],
  FD: ["tooth", "shield"],
  CR: ["drop"],
  MO: ["cell", "liver"],
};

/** A text if it exists (t() returns the key itself for a missing one). */
function text(key: string): string | undefined {
  const v = t(key as MessageKey);
  return v === key ? undefined : v;
}

export interface QuickFact {
  icon: string;
  label: string;
  value: string;
  /** Short name of the source, for the sources line. */
  source: string;
  url?: string;
  /** One sentence on what the fact means, shown when it is tapped. */
  detail?: string;
}

/** Who the store sizes are for: they scale with body weight and, for iron, differ by sex. */
export interface FactContext {
  weightKg: number;
  sex?: Sex;
  /** The absorbed daily need. */
  physiological: number;
}

/** A store size range in the largest unit that keeps it readable ("2–3 mg", "0.5–1.5 g"). */
export function fmtStoreRange(id: string, r: Pick<Range, "low" | "high">): string {
  let { low, high } = r;
  let unit = NUTRIENT_BY_ID.get(id)?.unit ?? "";
  if (unit === "µg" && high >= 1000) {
    low /= 1000;
    high /= 1000;
    unit = "mg";
  }
  if (unit === "mg" && high >= 1000) {
    low /= 1000;
    high /= 1000;
    unit = "g";
  }
  const decimals = high < 10 ? 1 : 0;
  return `${fmtNumber(low, decimals)}–${fmtNumber(high, decimals)} ${unit}`;
}

/** Short form of a long model citation ("EFSA NDA Panel (2015): DRVs for calcium — …" → "EFSA NDA Panel (2015)"). */
function shortSource(s: string): string {
  return s.split(/: | — |, Section /)[0] ?? s;
}

/**
 * Quick facts from model/: whether the body makes it, how much is taken up (where the model has a
 * sourced share), how much survives boiling (where USDA has a factor). Facts the model has no source
 * for are left out, not shown as zero or full.
 */
export function quickFacts(id: string, ctx?: FactContext): QuickFact[] {
  const key = infoId(id);
  const facts: QuickFact[] = [];
  const made = bodyMakes[key];
  if (made)
    facts.push({
      icon: "cell",
      label: t("does.made"),
      value:
        text(`does.made.${key}`) ?? t(`does.made.${made.value}` as MessageKey),
      source: shortSource(made.source),
      url: made.url,
    });
  const p = nutrientParams[id];
  const up = p?.typicalAbsorption;
  // "Modelling convention" = not modelled (1.0); iron's share is derived and not used (its own meal rule).
  if (up && up.source !== "Modelling convention" && p.rule.type !== "iron") {
    const range = up.range;
    const value =
      up.value >= 0.9 && (!range || range[0] >= 0.9)
        ? t("does.uptake.all")
        : range
          ? `${Math.round(range[0] * 100)}–${fmtPercent(range[1])}`
          : t("does.uptake.about", { pct: fmtPercent(up.value) });
    facts.push({
      icon: "gut",
      label: t("does.uptake"),
      value,
      source: shortSource(up.source),
      url: up.url,
      detail: t("does.uptake.detail", { value }),
    });
  }
  const perMeal = perMealFact(id);
  if (perMeal) facts.push(perMeal);
  const store = storeFacts(id, ctx);
  facts.push(...store);
  const cls = retentionClassOf[id];
  const boiled = cls ? preparationRetention.value.boiled[cls] : undefined;
  if (boiled) {
    const value =
      boiled.low === boiled.high
        ? fmtPercent(boiled.central)
        : `${Math.round(boiled.low * 100)}–${fmtPercent(boiled.high)}`;
    facts.push({
      icon: "pot",
      label: t("does.boiled"),
      value,
      source: shortSource(preparationRetention.source),
      url: preparationRetention.url,
    });
  }
  return facts;
}

/** How much one meal can give, where the model has a sourced limit per meal. */
function perMealFact(id: string): QuickFact | undefined {
  const rule = nutrientParams[id]?.rule;
  if (!rule) return undefined;
  const base = { icon: "gauge", label: t("does.perMeal") };
  if (rule.type === "saturable") {
    const amount = fmtAmount(id, rule.activeCapPerMeal.value.central);
    return {
      ...base,
      value: t("does.perMeal.cap", { amount }),
      source: shortSource(rule.activeCapPerMeal.source),
      url: rule.activeCapPerMeal.url,
      detail: t("does.perMeal.capDetail", { amount, pct: fmtPercent(rule.passiveFraction.value.central) }),
    };
  }
  if (rule.type === "doseTable") {
    // The largest single dose still taken up in full.
    const full = rule.points.value.filter(([, f]) => f >= 1).at(-1)?.[0];
    if (!full) return undefined;
    const amount = fmtAmount(id, full);
    return {
      ...base,
      value: t("does.perMeal.full", { amount }),
      source: shortSource(rule.points.source),
      url: rule.points.url,
      detail: t("does.perMeal.fullDetail", { amount }),
    };
  }
  if (rule.type === "doseLog")
    return {
      ...base,
      value: t("does.perMeal.less"),
      source: shortSource(rule.source),
      url: rule.url,
      detail: t("does.perMeal.lessDetail"),
    };
  return undefined;
}

/** Where the body keeps it and how big the store is, and how fast its level follows a change. */
function storeFacts(id: string, ctx?: FactContext): QuickFact[] {
  const out: QuickFact[] = [];
  const model = storage[id];
  if (model?.kind === "tank" && ctx) {
    const range = tankCapacityRange(id, ctx.weightKg, ctx.sex, ctx.physiological);
    if (range) {
      const size = fmtStoreRange(id, range);
      out.push({
        icon: "tank",
        label: t("does.store"),
        value: size,
        source: shortSource(model.capacity.source),
        url: model.capacity.url,
        detail: t("does.store.detail", { size, kg: fmtNumber(ctx.weightKg) }),
      });
    }
  }
  const turn = turnover[id];
  if (turn) {
    const half = fmtDuration(turn.value.halfLifeDays);
    const steady = fmtDuration(turn.value.steadyDays);
    out.push({
      icon: "tank",
      label: t("does.store"),
      value: t(`does.store.${turn.value.where}`),
      source: shortSource(turn.source),
      url: turn.url,
      detail: t(`does.store.${turn.value.where}Detail`),
    });
    out.push({
      icon: "hourglass",
      label: t("does.turnover"),
      value: t("does.turnover.value", { half, steady }),
      source: shortSource(turn.source),
      url: turn.url,
      detail: t("does.turnover.detail", { half, steady }),
    });
  }
  return out;
}

/**
 * "What it does" as tiles (owner's ask, 2026-10-26: less text, more visual, more to learn): the roles
 * with an icon each, where it is found, and a few quick facts with their sources.
 */
export function WhatItDoes({
  id,
  skipUrl,
  extra,
}: {
  id: string;
  skipUrl?: string;
  extra?: string;
}) {
  const key = infoId(id);
  const icons = ROLE_ICONS[key] ?? [];
  const foods = text(`does.${key}.foods`);
  const note = text(`does.${key}.note`);
  const d = useData();
  const physiological = d.requirements.byNutrient.get(id)?.physiological;
  const facts = quickFacts(
    id,
    physiological !== undefined ? { weightKg: d.weightKg, sex: d.profile.sex, physiological } : undefined,
  );
  const [open, setOpen] = useState<QuickFact | null>(null);
  // The page's own source line follows; don't name it twice.
  const sources = facts.filter(
    (f, i) =>
      facts.findIndex((x) => x.source === f.source) === i &&
      (!f.url || f.url !== skipUrl),
  );
  return (
    <div className="does">
      <ul className="role-tiles">
        {icons.map((icon, i) => (
          <li key={i} className="role-tile">
            <Icon name={icon} size={20} />
            <span>{t(`does.${key}.${i + 1}` as MessageKey)}</span>
          </li>
        ))}
      </ul>
      {extra && <p className="does-note">{extra}</p>}
      {note && <p className="does-note">{note}</p>}
      {foods && (
        <p className="rung-row">
          <Icon name="basket" size={16} />
          <span>
            <strong>{t("does.foods")}:</strong> {foods}
          </span>
        </p>
      )}
      {facts.length > 0 && (
        <>
          <h4 className="rung-label">{t("does.facts")}</h4>
          <ul className="quick-facts">
            {facts.map((f) => {
              const body = (
                <>
                  <Icon name={f.icon} size={16} />
                  <span className="quick-fact-label">{f.label}</span>
                  <strong className="quick-fact-value">{f.value}</strong>
                </>
              );
              return (
                <li key={`${f.label}·${f.value}`} className="quick-fact">
                  {f.detail ? (
                    <button type="button" className="quick-fact-btn" onClick={() => setOpen(f)}>
                      {body}
                      <Icon name="chevron" size={12} />
                    </button>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
          {sources.length > 0 && (
            <p className="muted rung-sources">
              {t("does.factSources")}:{" "}
              {sources.map((s, i) => (
                <span key={s.source}>
                  {i > 0 && " · "}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.source}
                    </a>
                  ) : (
                    s.source
                  )}
                </span>
              ))}
            </p>
          )}
        </>
      )}
      {open &&
        createPortal(
          <Sheet title={open.label} onClose={() => setOpen(null)}>
            <div className="info-sheet">
              <p>
                <strong>{open.value}</strong>
              </p>
              <p>{open.detail}</p>
              <p className="muted small">
                {open.url ? (
                  <a href={open.url} target="_blank" rel="noreferrer">
                    {open.source}
                  </a>
                ) : (
                  open.source
                )}
              </p>
            </div>
          </Sheet>,
          document.body,
        )}
    </div>
  );
}
