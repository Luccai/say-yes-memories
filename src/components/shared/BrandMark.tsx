import Image from "next/image";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={`paper-grain relative grid shrink-0 place-items-center overflow-hidden border border-[rgba(139,107,63,0.42)] bg-[#ded1bd] shadow-none ring-1 ring-white/75 sm:shadow-[0_14px_34px_rgba(58,40,25,0.12)] ${
          compact ? "size-16 rounded-[22px] p-1.5" : "size-28 rounded-[32px] p-2.5"
        }`}
      >
        <div className="absolute inset-1.5 rounded-[26px] border border-white/80 bg-[rgba(255,250,243,0.78)]" />
        <Image
          src="/brand/logo.png"
          alt="Say Yes Digital"
          width={192}
          height={192}
          className="relative z-10 h-full w-full rounded-[24px] object-contain"
          style={{ filter: "contrast(1.22) brightness(0.94)" }}
          priority
        />
      </div>
      {!compact ? (
        <div className="hidden min-w-0 sm:block">
          <p className="truncate font-display text-2xl font-semibold leading-none text-[var(--ink)]">
            Say Yes
          </p>
          <p className="eyebrow mt-1.5 truncate text-[var(--champagne-deep)]">
            Digital memories
          </p>
        </div>
      ) : null}
    </div>
  );
}
