import { t, type MessageKey } from "../../i18n";
import { infoId } from "../../i18n/nutrientInfo.en";
import { fmtPercent } from "../../lib/format";
import { Icon } from "../../ui/Icon";
import { bodyMakes } from "../../../model/nutrientFacts";
import {
  nutrientParams,
  preparationRetention,
  retentionClassOf,
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
export function quickFacts(id: string): QuickFact[] {
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
    });
  }
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
  const facts = quickFacts(id);
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
            {facts.map((f) => (
              <li key={f.label} className="quick-fact">
                <Icon name={f.icon} size={16} />
                <span className="quick-fact-label">{f.label}</span>
                <strong className="quick-fact-value">{f.value}</strong>
              </li>
            ))}
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
    </div>
  );
}
