"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { WeddingMedia } from "@/lib/types";
import { Button } from "@/components/shared/Button";
import type { AdminCopy } from "@/components/admin/types";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";

type DeleteMemoryDialogProps = {
  target: WeddingMedia | null;
  deleting: boolean;
  error: string;
  reduceMotion: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  text: AdminCopy;
};

export function DeleteMemoryDialog({
  target,
  deleting,
  error,
  reduceMotion,
  onCancel,
  onConfirm,
  text,
}: DeleteMemoryDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useAccessibleDialog({
    open: Boolean(target),
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onClose: () => {
      if (!deleting) onCancel();
    },
  });

  return (
    <AnimatePresence>
      {target ? (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(31,23,18,0.38)] px-4 backdrop-blur-sm"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <motion.div
            ref={dialogRef}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{
              duration: reduceMotion ? 0 : 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="w-full max-w-sm rounded-[28px] border border-white/75 bg-[var(--paper-soft)] p-5 shadow-[0_28px_80px_rgba(31,23,18,0.24)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-memory-title"
            tabIndex={-1}
          >
            <p
              id="delete-memory-title"
              className="font-display text-fluid-subheading font-semibold text-[var(--ink)]"
            >
              {text.deleteTitle}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
              {text.deleteBody}
            </p>
            {error ? (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button
                ref={cancelRef}
                onClick={onCancel}
                disabled={deleting}
                variant="paper"
              >
                {text.no}
              </Button>
              <Button
                onClick={onConfirm}
                disabled={deleting}
                loading={deleting}
                variant="danger"
                className="!bg-[var(--rosewood)] !text-white hover:!bg-[#6f332b]"
              >
                {text.yes}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
