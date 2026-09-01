import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastValue { notify: (message: string) => void }
const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const notify = useCallback((next: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    setMessage(next);
    timer.current = window.setTimeout(() => setMessage(''), 4200);
  }, []);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return <ToastContext.Provider value={value}>
    {children}
    {message && <div className="toast" role="status" aria-live="polite"><CheckCircle2 size={19} /><span>{message}</span><button type="button" aria-label="Dismiss notification" onClick={() => setMessage('')}><X size={17} /></button></div>}
  </ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within ToastProvider');
  return value;
}
