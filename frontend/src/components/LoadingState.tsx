export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-4 bg-slate-100 rounded animate-pulse flex-1" />
          <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
          <div className="h-4 bg-slate-50 rounded animate-pulse w-16" />
        </div>
      ))}
    </div>
  );
}
