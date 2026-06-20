import Image from "next/image";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid size-12 place-items-center overflow-hidden rounded-full border border-[var(--line)] bg-[var(--paper-soft)] shadow-[0_12px_28px_rgba(58,40,25,0.1)]">
        <Image
          src="/brand/logo.png"
          alt="Say Yes Digital"
          width={72}
          height={72}
          className="size-11 object-cover"
          priority
        />
      </div>
      {!compact ? (
        <div>
          <p className="font-[var(--font-display)] text-2xl font-semibold leading-none text-[var(--ink)]">
            Say Yes
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase text-[var(--champagne-deep)]">
            Digital memories
          </p>
        </div>
      ) : null}
    </div>
  );
}
