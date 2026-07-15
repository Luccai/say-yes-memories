"use client";

import { useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AdminCopy } from "@/components/admin/types";
import { Button } from "@/components/shared/Button";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type ProfilePhotoRemoveDialogProps = {
  open: boolean;
  removing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  text: AdminCopy;
};

export function ProfilePhotoRemoveDialog({
  open,
  removing,
  onCancel,
  onConfirm,
  text,
}: ProfilePhotoRemoveDialogProps) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(open);

  useAccessibleDialog({
    open,
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onClose: () => {
      if (!removing) onCancel();
    },
  });

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(31,23,18,0.38)] px-4 backdrop-blur-sm"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-profile-photo-title"
            aria-describedby="remove-profile-photo-description"
            data-profile-photo-remove-dialog="true"
            tabIndex={-1}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{
              duration: reduceMotion ? 0 : 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="w-full max-w-sm rounded-[28px] border border-white/75 bg-[var(--paper-soft)] p-5 shadow-[0_28px_80px_rgba(31,23,18,0.24)]"
          >
            <p
              id="remove-profile-photo-title"
              className="font-display text-fluid-subheading font-semibold text-[var(--ink)]"
            >
              {text.removePhotoTitle}
            </p>
            <p
              id="remove-profile-photo-description"
              className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]"
            >
              {text.removePhotoBody}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button
                ref={cancelRef}
                onClick={onCancel}
                disabled={removing}
                variant="paper"
              >
                {text.keepPhoto}
              </Button>
              <Button
                onClick={onConfirm}
                loading={removing}
                variant="danger"
                className="!bg-[var(--rosewood)] !text-white hover:!bg-[#6f332b]"
              >
                {text.confirmRemovePhoto}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
