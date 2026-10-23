import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { packHints, pieceWeight, piecesToGrams, MAX_PIECE_GRAMS, type PieceWeight } from '../../foods/pieces';
import { fmtNumber } from '../../lib/format';
import { repo } from '../../storage/repo';
import type { PortionSize, Product } from '../../storage/types';
import { Field, NumberInput, Segmented } from '../../ui/controls';

export interface Amount {
  grams: number | undefined;
  /** Set when the amount is a count of pieces; then `grams` is pieces × the piece weight. */
  pieces?: number;
}

/** Piece counts offered as chips, plus the whole pack when its count is known. */
const PIECE_CHIPS = [1, 2, 3, 5];

/** The weight of one piece of a food: the user's own, else what the product's label text gives. */
export function usePieceWeight(code: string, product: Product | undefined): { piece: PieceWeight | undefined; sizes: PortionSize[] | undefined; loaded: boolean } {
  const sizes = useLiveQuery(async () => (await repo.getMeta<PortionSize[]>(`portions:${code}`)) ?? [], [code]);
  return { piece: pieceWeight(sizes, product), sizes, loaded: sizes !== undefined };
}

const fmtG = (g: number, unit: string) => `${fmtNumber(g, g < 10 ? 2 : 1)} ${unit}`;

/** Save (or remove) the user's piece weight for a food, with undo. */
function useSavePiece(code: string, unit: string) {
  const toast = useToast();
  return async (grams: number | undefined) => {
    const before = await repo.setPieceWeight(code, grams, t('piece.label'));
    toast(t(grams ? 'piece.saved' : 'piece.removed', { g: grams ? fmtG(grams, unit) : '' }), () => void repo.setMeta(`portions:${code}`, before ?? []));
  };
}

/** The food page's line for one piece: its weight and where it is from, with a way to set or change it. Products always show it. */
export function PieceWeightLine({ code, product }: { code: string; product?: Product }) {
  const { piece, loaded } = usePieceWeight(code, product);
  const unit = product?.perMl ? 'ml' : 'g';
  const save = useSavePiece(code, unit);
  const [editing, setEditing] = useState(false);
  // A BLS food without one says nothing (oil has no pieces); the amount sheet can still set one.
  if (!loaded || (!piece && !product)) return null;
  if (editing)
    return (
      <div className="card">
        <PieceWeightEditor
          product={product}
          unit={unit}
          current={piece}
          onSave={(g) => {
            void save(g);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  return (
    <p className="muted small piece-line">
      {piece ? t(piece.from === 'yours' ? 'piece.yours' : 'piece.fromLabel', { g: fmtG(piece.grams, unit), text: piece.text ?? '' }) : t('piece.notSet')}{' '}
      <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(true)}>
        {t(piece ? 'piece.change' : 'piece.set')}
      </button>
    </p>
  );
}

/**
 * How much of a food: grams (ml for drinks) or pieces. Pieces need the weight of one piece: the
 * user's (saved with the food's portion sizes, so it is in backups) or one read from the label;
 * without either, the user types it once, or the pack's weight and count. `children` (chips and
 * the like) show in grams mode only.
 */
export function AmountField({ code, product, value, onChange, autoFocus, children }: { code: string; product?: Product; value: Amount; onChange: (a: Amount) => void; autoFocus?: boolean; children?: ReactNode }) {
  const { piece, loaded } = usePieceWeight(code, product);
  const unit = product?.perMl ? 'ml' : 'g';
  const [mode, setMode] = useState<'grams' | 'pieces'>(value.pieces !== undefined ? 'pieces' : 'grams');
  const [editing, setEditing] = useState(false);
  // A food the user gave a piece weight starts in pieces: they counted it before.
  const started = useRef(value.grams !== undefined || value.pieces !== undefined);
  useEffect(() => {
    if (started.current || !loaded) return;
    started.current = true;
    if (piece?.from === 'yours') setMode('pieces');
  }, [loaded, piece]);
  // A changed piece weight changes what the pieces weigh.
  const pieceGrams = piece?.grams;
  useEffect(() => {
    if (mode !== 'pieces' || value.pieces === undefined || !pieceGrams) return;
    const grams = piecesToGrams(value.pieces, pieceGrams);
    if (grams !== value.grams) onChange({ grams, pieces: value.pieces });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceGrams, mode]);

  function switchTo(next: 'grams' | 'pieces') {
    setMode(next);
    started.current = true;
    if (next === 'grams') onChange({ grams: value.grams });
    else if (pieceGrams && value.grams) {
      const pieces = Math.max(1, Math.round(value.grams / pieceGrams));
      onChange({ grams: piecesToGrams(pieces, pieceGrams), pieces });
    } else onChange({ grams: undefined, pieces: undefined });
  }

  function setPieces(pieces: number | undefined) {
    onChange({ grams: pieces && pieceGrams ? piecesToGrams(pieces, pieceGrams) : undefined, pieces });
  }

  const save = useSavePiece(code, unit);
  async function savePiece(grams: number | undefined) {
    await save(grams);
    setEditing(false);
  }

  const packCount = packHints(product).count;
  return (
    <div className="field amount-field">
      <div className="row-between">
        <span className="field-label">{t('log.amount')}</span>
        <Segmented<'grams' | 'pieces'>
          className="amount-unit"
          label={t('piece.unitLabel')}
          value={mode}
          onChange={switchTo}
          options={[
            { value: 'grams', label: unit },
            { value: 'pieces', label: t('piece.pieces') },
          ]}
        />
      </div>
      {mode === 'grams' ? (
        <>
          <NumberInput value={value.grams} onChange={(grams) => onChange({ grams })} placeholder="0" suffix={unit} min={0} autoFocus={autoFocus} />
          {children}
        </>
      ) : piece && !editing ? (
        <>
          <NumberInput value={value.pieces} onChange={setPieces} placeholder="0" suffix={t('piece.pcs')} min={0} autoFocus={autoFocus} />
          <p className="muted small piece-line">
            {t(piece.from === 'yours' ? 'piece.yours' : 'piece.fromLabel', { g: fmtG(piece.grams, unit), text: piece.text ?? '' })}
            {value.grams ? ` · ${t('piece.total', { g: fmtG(value.grams, unit) })}` : ''}{' '}
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(true)}>
              {t('piece.change')}
            </button>
          </p>
          <div className="chips">
            {[...PIECE_CHIPS, ...(packCount && !PIECE_CHIPS.includes(packCount) ? [packCount] : [])].map((n) => (
              <button key={n} type="button" className={`chip${value.pieces === n ? ' on' : ''}`} onClick={() => setPieces(n)}>
                {n === packCount ? t('piece.wholePack', { n }) : t(n === 1 ? 'piece.one' : 'piece.many', { n })}
              </button>
            ))}
          </div>
        </>
      ) : (
        <PieceWeightEditor product={product} unit={unit} current={piece} onSave={(g) => void savePiece(g)} onCancel={piece ? () => setEditing(false) : undefined} />
      )}
    </div>
  );
}

/**
 * Type the weight of one piece, or the pack's weight and how many pieces it holds (the app
 * divides). Starts from what the pack text says ("60 pieces", "42 g").
 */
function PieceWeightEditor({ product, unit, current, onSave, onCancel }: { product?: Product; unit: string; current?: PieceWeight; onSave: (g: number | undefined) => void; onCancel?: () => void }) {
  const hints = packHints(product);
  const [packGrams, setPackGrams] = useState<number | undefined>(hints.grams);
  const [count, setCount] = useState<number | undefined>(hints.count);
  const fromPack = packGrams && count ? Math.round((packGrams / count) * 100) / 100 : undefined;
  const [own, setOwn] = useState<number | undefined>(current?.grams ?? fromPack);
  const grams = own;
  const valid = !!grams && grams > 0 && grams <= MAX_PIECE_GRAMS;

  function setPack(g: number | undefined, n: number | undefined) {
    setPackGrams(g);
    setCount(n);
    if (g && n) setOwn(Math.round((g / n) * 100) / 100);
  }

  return (
    <div className="piece-editor">
      <p className="small">{t(current ? 'piece.editTitle' : product ? 'piece.unknownProduct' : 'piece.unknown')}</p>
      <Field label={t('piece.onePiece')}>{(id) => <NumberInput id={id} value={own} onChange={setOwn} placeholder="0" suffix={unit} min={0} autoFocus />}</Field>
      <p className="muted small">{t('piece.orFromPack')}</p>
      <div className="grid-2">
        <Field label={t('piece.packWeight')}>{(id) => <NumberInput id={id} value={packGrams} onChange={(g) => setPack(g, count)} placeholder="0" suffix={unit} min={0} />}</Field>
        <Field label={t('piece.packCount')}>{(id) => <NumberInput id={id} value={count} onChange={(n) => setPack(packGrams, n)} placeholder="0" suffix={t('piece.pcs')} min={0} />}</Field>
      </div>
      {own !== undefined && own > MAX_PIECE_GRAMS && <p className="notice small">{t('piece.tooHeavy', { max: `${MAX_PIECE_GRAMS} ${unit}` })}</p>}
      <div className="row piece-actions">
        {current?.from === 'yours' && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => onSave(undefined)}>
            {t('piece.remove')}
          </button>
        )}
        {onCancel && (
          <button type="button" className="btn btn-small btn-ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
        <button type="button" className="btn btn-small btn-primary" disabled={!valid} onClick={() => onSave(grams)}>
          {t('piece.save')}
        </button>
      </div>
    </div>
  );
}
