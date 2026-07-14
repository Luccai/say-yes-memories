type StorageMeterProps = {
  label: string;
  percent: number;
};

export function StorageMeter({ label, percent }: StorageMeterProps) {
  const normalizedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-[var(--ink-soft)]">
        <span>{label}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(normalizedPercent)}
        className="h-3 overflow-hidden rounded-full border border-[rgba(139,107,63,0.18)] bg-white/64"
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--champagne-deep),var(--rosewood))] transition-[width] duration-500"
          style={{ width: `${normalizedPercent}%` }}
        />
      </div>
    </div>
  );
}
