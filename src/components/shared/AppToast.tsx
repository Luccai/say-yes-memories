"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, CircleAlert, X } from "lucide-react";

export type AppToastMessage = {
  id: number;
  message: string;
  tone: "error" | "success";
};

export function AppToast({
  toast,
  closeLabel,
  onClose,
}: {
  toast: AppToastMessage | null;
  closeLabel: string;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(
      onClose,
      toast.tone === "error" ? 6_000 : 2_800,
    );
    return () => window.clearTimeout(timeoutId);
  }, [onClose, toast]);

  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
          data-app-toast={toast.tone}
          initial={reduceMotion ? false : { opacity: 0, y: -10, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={reduceMotion ? { opacity: 0, x: "-50%" } : { opacity: 0, y: -8, x: "-50%" }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={`fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[100] flex w-[calc(100%-2rem)] max-w-md items-start gap-3 rounded-[22px] border px-4 py-3 shadow-[0_18px_44px_rgba(58,40,25,0.16)] backdrop-blur-xl ${
            toast.tone === "error"
              ? "border-[rgba(140,81,68,0.24)] bg-[rgba(255,248,244,0.94)] text-[var(--rosewood)]"
              : "border-[rgba(104,125,96,0.24)] bg-[rgba(248,250,243,0.94)] text-[var(--ink)]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
              toast.tone === "error"
                ? "bg-[rgba(140,81,68,0.1)]"
                : "bg-[rgba(117,137,106,0.14)] text-[#52694c]"
            }`}
          >
            {toast.tone === "error" ? (
              <CircleAlert className="size-4" />
            ) : (
              <Check className="size-4" />
            )}
          </span>
          <p className="min-w-0 flex-1 pt-1 text-sm font-bold leading-5 text-current">
            {toast.message}
          </p>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="focus-ring grid size-9 shrink-0 place-items-center rounded-full opacity-70 transition hover:bg-black/5 hover:opacity-100 active:scale-95"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
