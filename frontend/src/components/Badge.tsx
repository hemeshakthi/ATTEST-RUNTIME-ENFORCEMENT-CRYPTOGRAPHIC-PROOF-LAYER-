import React from 'react';

type BadgeVariant = 'allowed' | 'blocked' | 'pending' | 'draft' | 'deployed' | 'deprecated' | 'neutral';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  allowed: 'bg-[var(--color-allowed-bg)] text-[var(--color-allowed)] border-[var(--color-allowed)]/20',
  blocked: 'bg-[var(--color-blocked-bg)] text-[var(--color-blocked)] border-[var(--color-blocked)]/20',
  pending: 'bg-[var(--color-pending-bg)] text-[var(--color-pending)] border-[var(--color-pending)]/20',
  draft: 'bg-slate-50 text-slate-600 border-slate-200',
  deployed: 'bg-[var(--color-allowed-bg)] text-[var(--color-allowed)] border-[var(--color-allowed)]/20',
  deprecated: 'bg-slate-50 text-slate-400 border-slate-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
};

const dotStyles: Record<BadgeVariant, string> = {
  allowed: 'bg-[var(--color-allowed)]',
  blocked: 'bg-[var(--color-blocked)]',
  pending: 'bg-[var(--color-pending)]',
  draft: 'bg-slate-400',
  deployed: 'bg-[var(--color-allowed)]',
  deprecated: 'bg-slate-300',
  neutral: 'bg-slate-400',
};

export function Badge({ variant, children, dot }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border rounded-md ${variantStyles[variant]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]}`} />}
      {children}
    </span>
  );
}
