import React, { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'info' | 'success' | 'error' | 'warning';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  addToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType>({ addToast: () => {} });
export const useToast = () => useContext(ToastContext);

const typeStyles: Record<ToastType, string> = {
  info: 'border-l-[var(--color-accent)] bg-blue-50 text-slate-800',
  success: 'border-l-[var(--color-allowed)] bg-[var(--color-allowed-bg)] text-slate-800',
  error: 'border-l-[var(--color-blocked)] bg-[var(--color-blocked-bg)] text-slate-800',
  warning: 'border-l-[var(--color-pending)] bg-[var(--color-pending-bg)] text-slate-800',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let counter = 0;

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++counter;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-md border border-[var(--color-border)] border-l-4 text-sm shadow-sm ${typeStyles[t.type]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
