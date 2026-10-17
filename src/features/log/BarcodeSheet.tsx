import { useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '../../i18n';
import { findProduct } from '../../foods/findProduct';
import { normalizeBarcode } from '../../foods/openFoodFacts';
import type { Product } from '../../storage/types';
import { Field, Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { barcodesInPhoto, canDetectBarcodes, detectBarcodes } from './barcode';

/** How often the live camera view is checked for a barcode. */
const SCAN_INTERVAL_MS = 250;

type Status = { kind: 'idle' } | { kind: 'looking'; code: string } | { kind: 'notFound'; code: string } | { kind: 'error'; message: MessageKey };

const LOOKUP_ERRORS: Record<'offline' | 'busy' | 'other', MessageKey> = {
  offline: 'off.error.offline',
  busy: 'off.error.busy',
  other: 'off.error.other',
};

/**
 * Scan or type a barcode, then find the product on this phone or at Open Food Facts. Without
 * `onManual` (changing a logged entry) an unknown product offers no manual entry.
 */
export function BarcodeSheet({ onFound, onManual, onClose }: { onFound: (p: Product) => void; onManual?: () => void; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [camera, setCamera] = useState<'starting' | 'on' | 'failed' | 'unsupported'>(() => (canDetectBarcodes() && typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'starting' : 'unsupported'));
  const busy = useRef(false);
  const photoRef = useRef<HTMLInputElement>(null);

  async function lookUp(raw: string) {
    const code = normalizeBarcode(raw);
    if (!code) return setStatus({ kind: 'error', message: 'off.error.invalid' });
    if (busy.current) return;
    busy.current = true;
    setStatus({ kind: 'looking', code });
    try {
      const r = await findProduct(code);
      if (r.kind === 'found') onFound(r.product);
      else if (r.kind === 'notFound') setStatus({ kind: 'notFound', code });
      else setStatus({ kind: 'error', message: LOOKUP_ERRORS[r.reason] });
    } finally {
      busy.current = false;
    }
  }

  async function fromPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const [code] = await barcodesInPhoto(file);
    if (code) {
      setTyped(code);
      await lookUp(code);
    } else setStatus({ kind: 'error', message: 'off.error.noBarcode' });
  }

  return (
    <Sheet title={t('off.scanTitle')} onClose={onClose}>
      {camera === 'starting' || camera === 'on' ? (
        <LiveScanner
          paused={status.kind === 'looking' || status.kind === 'notFound'}
          onStarted={() => setCamera('on')}
          onFailed={() => setCamera('failed')}
          onCode={(code) => {
            setTyped(code);
            void lookUp(code);
          }}
        />
      ) : null}
      {camera === 'on' && <p className="muted small">{t('off.scanHint')}</p>}
      {camera === 'failed' && <p className="muted small">{t('off.cameraFailed')}</p>}
      {camera === 'unsupported' && <p className="muted small">{t('off.noDetector')}</p>}
      {camera === 'failed' && (
        <>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void fromPhoto(e.target.files).then(() => (e.target.value = ''))} />
          <button className="btn btn-secondary" onClick={() => photoRef.current?.click()}>
            <Icon name="camera" /> {t('off.takePhoto')}
          </button>
        </>
      )}

      <form
        className="row barcode-form"
        onSubmit={(e) => {
          e.preventDefault();
          void lookUp(typed);
        }}
      >
        <Field label={t('off.typeBarcode')}>
          {(id) => <input id={id} inputMode="numeric" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('off.barcodePlaceholder')} />}
        </Field>
        <button className="btn btn-primary" type="submit" disabled={!typed.trim() || status.kind === 'looking'}>
          {t('off.lookUp')}
        </button>
      </form>

      {status.kind === 'looking' && (
        <p className="muted" role="status">
          {t('off.looking', { code: status.code })}
        </p>
      )}
      {status.kind === 'error' && (
        <p className="notice" role="alert">
          <Icon name="alert" size={16} /> {t(status.message)}
        </p>
      )}
      {status.kind === 'notFound' && (
        <div className="card notice-card" role="alert">
          <p>{t(onManual ? 'off.notFound' : 'off.notFoundEdit', { code: status.code })}</p>
          <div className="row">
            {onManual && (
              <button className="btn btn-secondary" onClick={onManual}>
                {t('log.manual')}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setStatus({ kind: 'idle' })}>
              {t('off.scanAnother')}
            </button>
          </div>
        </div>
      )}
      <p className="muted small">{t('off.privacy')}</p>
    </Sheet>
  );
}

/** The back camera, checked for a barcode a few times a second until one is found. */
function LiveScanner({ paused, onCode, onStarted, onFailed }: { paused: boolean; onCode: (code: string) => void; onStarted: () => void; onFailed: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onCode, onStarted, onFailed, paused });
  callbacks.current = { onCode, onStarted, onFailed, paused };

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();
        callbacks.current.onStarted();
      } catch {
        if (!stopped) callbacks.current.onFailed();
        return;
      }
      let last = '';
      const tick = async () => {
        if (stopped) return;
        const video = videoRef.current;
        if (video && !callbacks.current.paused && video.readyState >= 2) {
          const [code] = await detectBarcodes(video);
          // The same code again while paused or after a miss is ignored until a different one shows up.
          if (code && code !== last && !stopped) {
            last = code;
            callbacks.current.onCode(code);
          }
        }
        timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
      };
      void tick();
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="scanner">
      <video ref={videoRef} playsInline muted aria-label={t('off.cameraView')} />
      <div className="scanner-frame" aria-hidden />
    </div>
  );
}
