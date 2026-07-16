"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";

type BlurFadeProps = {
  children: ReactNode;
  delay?: number;
  replayKey: number;
  replayOnMount?: boolean;
  onEntered?: () => void;
  className?: string;
};

export function BlurFade({
  children,
  delay = 0,
  replayKey,
  replayOnMount = true,
  onEntered,
  className = "",
}: BlurFadeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const getDelay = useEffectEvent(() => delay);
  const markEntered = useEffectEvent(() => onEntered?.());

  useEffect(() => {
    markEntered();
    if (
      !replayOnMount ||
      !rootRef.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const animation = rootRef.current.animate(
      [
        { opacity: 0, filter: "blur(10px)", transform: "translateY(10px)" },
        { opacity: 1, filter: "blur(0px)", transform: "translateY(0)" },
      ],
      {
        delay: getDelay() * 1_000,
        duration: 340,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "both",
      },
    );

    return () => animation.cancel();
  }, [replayKey, replayOnMount]);

  return (
    <div
      ref={rootRef}
      data-memory-blur-fade={replayKey}
      data-memory-replay={replayOnMount ? "true" : "false"}
      className={`min-w-0 w-full ${className}`}
    >
      {children}
    </div>
  );
}
