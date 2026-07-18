import React, { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const widthStyles = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Modal({ open, onClose, title, children, width = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className={`bg-white rounded-lg border border-[var(--color-border)] w-full ${widthStyles[width]} mx-4`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button onClick={onClose} className="text-[var(--color-secondary)] hover:text-[var(--color-primary)] p-1 cursor-pointer">✕</button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
