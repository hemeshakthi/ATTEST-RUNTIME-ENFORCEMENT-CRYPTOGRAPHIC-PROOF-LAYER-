import React, { useEffect, useRef } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
}

export function Drawer({ open, onClose, title, children, width = 'w-[480px]' }: DrawerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className={`${width} bg-white h-full border-l border-[var(--color-border)] flex flex-col animate-slide-in`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] shrink-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button onClick={onClose} className="text-[var(--color-secondary)] hover:text-[var(--color-primary)] p-1 cursor-pointer">✕</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
