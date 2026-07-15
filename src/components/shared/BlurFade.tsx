"use client";

import { useEffect, useEffectEvent, type ReactNode } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";

type BlurFadeProps = {
  children: ReactNode;
  delay?: number;
  replayKey: number;
  replayOnMount?: boolean;
  onEntered?: () => void;
  className?: string;
};

const hidden = { opacity: 0, filter: "blur(10px)", y: 10 };
const visible = { opacity: 1, filter: "blur(0px)", y: 0 };

export function BlurFade({
  children,
  delay = 0,
  replayKey,
  replayOnMount = true,
  onEntered,
  className = "",
}: BlurFadeProps) {
  const controls = useAnimationControls();
  const reduceMotion = useReducedMotion();
  const getDelay = useEffectEvent(() => delay);
  const markEntered = useEffectEvent(() => onEntered?.());

  useEffect(() => {
    if (reduceMotion) {
      controls.set(visible);
      markEntered();
      return;
    }

    if (!replayOnMount) {
      controls.set(visible);
      return;
    }

    controls.set(hidden);
    markEntered();
    void controls.start(visible, {
      delay: getDelay(),
      duration: 0.34,
      ease: [0.22, 1, 0.36, 1],
    });
  }, [controls, reduceMotion, replayKey, replayOnMount]);

  return (
    <motion.div
      data-memory-blur-fade={replayKey}
      data-memory-replay={replayOnMount ? "true" : "false"}
      initial={reduceMotion || !replayOnMount ? false : hidden}
      animate={controls}
      className={`min-w-0 w-full ${className}`}
    >
      {children}
    </motion.div>
  );
}
