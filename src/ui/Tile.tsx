import type { GaugeStatus, NutrientResult } from '../model/simulate';
import { NUTRIENT_BY_ID } from '../model/nutrients';
import { trendOf } from '../model/trend';
import { fmtPercent } from '../lib/format';
import { t } from '../i18n';
import { hasNoData, trendArrows, trendLabel } from './Gauge';
import { statusLabel } from './status';

/** Tile labels: chemical symbols and vitamin letters, so seven fit in a row on a phone. */
const SYMBOL: Record<string, string> = {
  ENERCC: 'kcal',
  PROT625: 'Prot',
  HIS: 'His',
  ILE: 'Ile',
  LEU: 'Leu',
  LYS: 'Lys',
  SAA: 'Met',
  AAA: 'Phe',
  THR: 'Thr',
  TRP: 'Trp',
  VAL: 'Val',
  FAT: 'Fat',
  FASAT: 'SFA',
  'F18:2CN6': 'LA',
  'F18:3CN3': 'ALA',
  EPADHA: 'EPA',
  CHO: 'Carb',
  SUGAR: 'Sug',
  FIBT: 'Fib',
  VITAA: 'A',
  VITD: 'D',
  VITE: 'E',
  // Not plain "K": potassium has that symbol.
  VITK: 'Vit K',
  THIA: 'B1',
  RIBF: 'B2',
  NIAEQ: 'B3',
  PANTAC: 'B5',
  VITB6: 'B6',
  BIOT: 'B7',
  FOL: 'Fol',
  VITB12: 'B12',
  VITC: 'C',
  NA: 'Na',
  CLD: 'Cl',
  K: 'K',
  CA: 'Ca',
  MG: 'Mg',
  P: 'P',
  FE: 'Fe',
  ZN: 'Zn',
  SE: 'Se',
  ID: 'I',
  CU: 'Cu',
  MN: 'Mn',
  FD: 'F',
  CR: 'Cr',
  MO: 'Mo',
};

export const symbolOf = (id: string) => SYMBOL[id] ?? NUTRIENT_BY_ID.get(id)?.short ?? id;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Status as a shape (design system): enough a filled dot, a bit low a half-filled dot, low an empty
 * ring, too much a triangle, unknown a dashed ring. Colour is extra, never the only cue.
 */
export function StatusMark({ status, size = 10, unsure = false }: { status: GaugeStatus; size?: number; unsure?: boolean }) {
  const cls = `smark smark-${status}`;
  const ring = 'M6 1.75a4.25 4.25 0 1 0 .01 0Z';
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 12 12" aria-hidden>
      {unsure ? (
        // The likely range crosses a status line: a ring with a wave, coloured by the middle value.
        <>
          <path d={ring} fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.6 6.4c.8-.9 1.6-.9 2.4 0s1.6.9 2.4 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </>
      ) : status === 'tooHigh' ? (
        <path d="M6 1.2L10.9 10.2H1.1Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      ) : status === 'fine' ? (
        <path d="M6 1.5a4.5 4.5 0 1 0 .01 0Z" fill="currentColor" />
      ) : status === 'gettingLow' ? (
        <>
          <path d={ring} fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 1.5a4.5 4.5 0 0 0 0 9Z" fill="currentColor" />
        </>
      ) : (
        <path d={ring} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={status === 'low' ? undefined : '2 1.6'} />
      )}
    </svg>
  );
}

/**
 * One nutrient as a tile (design system "four kinds of number"): a need fills from the bottom, full
 * tile = 100 %, solid to the low estimate, paler to the high one, a tick at the middle; a limit is
 * striped under a heavy lid; unknown is a dashed outline with "?". Taps through to the nutrient.
 */
export function NutrientTile({ result: r, showRange, onClick }: { result: NutrientResult; showRange: boolean; onClick: () => void }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const noData = r.status === 'unknown' || hasNoData(r);
  const status: GaugeStatus = noData ? 'unknown' : r.status;
  const low = clamp01(showRange ? r.value.low : r.value.central);
  const high = clamp01(showRange ? r.value.high : r.value.central);
  const mid = clamp01(r.value.central);
  const tr = noData ? null : trendOf(r);
  const pct = fmtPercent(r.value.central);
  const spoken = noData
    ? t('tile.unknownSpoken', { name: def?.name ?? r.id })
    : t(r.kind === 'limit' ? 'tile.limitSpoken' : 'tile.needSpoken', { name: def?.name ?? r.id, pct, status: statusLabel(status).toLowerCase() }) + (tr ? `, ${trendLabel(tr)}` : '');
  return (
    <button type="button" className={`ntile ntile-${r.kind} ntile-${status}`} onClick={onClick} aria-label={spoken}>
      {!noData && (
        <>
          <span className="ntile-fill" style={{ height: `${low * 100}%` }} />
          <span className="ntile-band" style={{ bottom: `${low * 100}%`, height: `${(high - low) * 100}%` }} />
          {/* The middle estimate only matters inside a range, and a full tile needs no mark at its top. */}
          {showRange && high > low && mid < 0.97 && <span className="ntile-tick" style={{ bottom: `calc(${mid * 100}% - 1px)` }} />}
        </>
      )}
      <span className="ntile-top">
        <span className={symbolOf(r.id).length > 3 ? 'ntile-name ntile-name-long' : 'ntile-name'} aria-hidden>
          {symbolOf(r.id)}
        </span>
        <StatusMark status={status} size={9} />
      </span>
      <span className="ntile-value" aria-hidden>
        {noData ? '?' : `${r.value.central >= 10 ? '>999%' : pct.replace(/\s/g, '')}${tr ? trendArrows(tr) : ''}`}
      </span>
    </button>
  );
}
