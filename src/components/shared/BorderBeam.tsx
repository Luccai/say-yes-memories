import type { CSSProperties } from "react";

type BorderBeamProps = {
  duration?: number;
  size?: number;
};

export function BorderBeam({ duration = 8, size = 100 }: BorderBeamProps) {
  return (
    <span
      aria-hidden="true"
      data-border-beam="true"
      className="border-beam-mask pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[inherit] p-[1.5px]"
    >
      <span
        className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2"
        style={
          {
            width: `calc(100% + ${size * 2}px)`,
            "--border-beam-duration": `${duration}s`,
          } as CSSProperties
        }
      >
        <span
          className="border-beam-spinner block size-full"
          style={{
            background:
              "conic-gradient(from 120deg, transparent 0deg, transparent 238deg, rgba(255,250,243,0.3) 245deg, rgba(199,166,111,0.96) 252deg, rgba(255,250,243,0.98) 259deg, rgba(139,107,63,0.9) 266deg, transparent 278deg, transparent 360deg)",
          }}
        />
      </span>
    </span>
  );
}
