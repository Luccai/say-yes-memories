"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MotionConfig } from "motion/react";

export function AppMotionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/owner")) return;

    const previousLanguage = document.documentElement.lang || "en";
    document.documentElement.lang = "tr";

    return () => {
      if (document.documentElement.lang === "tr") {
        document.documentElement.lang = previousLanguage;
      }
    };
  }, [pathname]);

  return (
    <MotionConfig reducedMotion="user" transition={{ ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </MotionConfig>
  );
}
