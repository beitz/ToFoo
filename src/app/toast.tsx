import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';

interface Toast {
  id: number;
  message: string;
  undo?: () => void | Promise<void>;
}

const ToastContext = createContext<(message: string, undo?: Toast['undo']) => void>(() => undefined);

/** Show a short message, optionally with Undo (instead of confirmation dialogs). */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((message: string, undo?: Toast['undo']) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), message, undo });
    timer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 3000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-area" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                className="toast-undo"
                onClick={() => {
                  void toast.undo?.();
                  setToast(null);
                }}
              >
                {t('common.undo')}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
