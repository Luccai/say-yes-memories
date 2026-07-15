"use client";

import { useRef } from "react";
import { Copy, Crown, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button, buttonStyles } from "@/components/shared/Button";
import type { useCopy } from "@/lib/i18n-client";
import type { PremiumPurchaseAction } from "@/lib/premium-purchase";
import type { Wedding } from "@/lib/types";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type AdminCopy = ReturnType<typeof useCopy>["admin"];

type PremiumExtensionDialogProps = {
  open: boolean;
  wedding: Wedding;
  demoMode: boolean;
  purchaseAction: PremiumPurchaseAction;
  coupleNameCopied: boolean;
  coupleNameCopyError: boolean;
  text: AdminCopy;
  onCopyCoupleName: () => void;
  onClose: () => void;
};

export function PremiumExtensionDialog({
  open,
  wedding,
  demoMode,
  purchaseAction,
  coupleNameCopied,
  coupleNameCopyError,
  text,
  onCopyCoupleName,
  onClose,
}: PremiumExtensionDialogProps) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(open);
  useAccessibleDialog({
    open,
    containerRef: dialogRef,
    initialFocusRef: closeRef,
    onClose,
  });

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-end bg-[rgba(31,23,18,0.24)] p-3 backdrop-blur-sm sm:place-items-center"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <button
            type="button"
            aria-label={text.close}
            className="absolute inset-0 cursor-default"
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            data-scroll-lock-allow="true"
            className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-[32rem] overflow-y-auto overscroll-contain rounded-[30px] border border-white/80 bg-[var(--paper-soft)] p-5 shadow-[0_28px_80px_rgba(31,23,18,0.22)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-extension-title"
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
                  <Crown className="size-4" />
                  {text.upgradePremium}
                </p>
                <h2
                  id="premium-extension-title"
                  className="mt-3 font-display text-2xl font-semibold text-[var(--ink)]"
                >
                  {text.premiumModalTitle}
                </h2>
              </div>
              <Button
                ref={closeRef}
                onClick={onClose}
                variant="paper"
                size="icon"
                className="!size-11 !min-h-11"
                aria-label={text.close}
              >
                <X className="size-4" />
              </Button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              {text.premiumModalBody}
            </p>
            <ol className="mt-5 grid gap-3 text-sm font-semibold text-[var(--ink)]">
              <li>{text.premiumStepCopy}</li>
              <li>{text.premiumStepBuy}</li>
              <li>{text.premiumStepSend}</li>
            </ol>
            <div className="mt-5 rounded-[22px] border border-[var(--line)] bg-white/54 p-4">
              <p className="text-[0.68rem] font-bold uppercase text-[var(--ink-soft)]">
                {text.upgradeCoupleName}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="break-words font-display text-xl font-semibold text-[var(--ink)]">
                  {wedding.coupleName}
                </span>
                <Button
                  onClick={onCopyCoupleName}
                  disabled={demoMode}
                  title={demoMode ? text.demoStorageNotice : undefined}
                  variant="paper"
                  size="compact"
                >
                  <Copy className="size-4" />
                  {coupleNameCopied ? text.copied : text.copyCoupleName}
                </Button>
              </div>
              {coupleNameCopyError ? (
                <p
                  className="mt-3 text-xs font-bold text-[var(--rosewood)]"
                  role="status"
                  aria-live="polite"
                >
                  {text.copyCoupleNameError}
                </p>
              ) : null}
            </div>
            {purchaseAction.kind === "demo" ? (
              <Button disabled variant="premium" className="mt-5 w-fit disabled:!opacity-75">
                <Crown className="size-4" />
                {text.demoPremiumPurchase}
              </Button>
            ) : purchaseAction.kind === "link" ? (
              <a
                href={purchaseAction.href}
                target="_blank"
                rel="noreferrer"
                data-app-button="premium"
                className={buttonStyles({ variant: "premium", className: "mt-5 w-fit" })}
              >
                <Crown className="size-4" />
                {text.openEtsyListing}
              </a>
            ) : (
              <p className="mt-5 rounded-[20px] border border-[var(--line)] bg-white/44 p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
                {text.premiumNoLink}
              </p>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
