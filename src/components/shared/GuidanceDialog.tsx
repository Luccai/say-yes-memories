"use client";

import { ExternalLink, HelpCircle, type LucideIcon, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/shared/Button";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";

type GuidanceCard = {
  title: string;
  body: string;
};

type GuidanceDialogProps = {
  open: boolean;
  onClose: () => void;
  closeLabel: string;
  eyebrow: string;
  title: string;
  body: string;
  steps: readonly string[];
  cards?: readonly GuidanceCard[];
  footer?: string;
  action?: {
    href: string;
    label: string;
    ariaLabel?: string;
  };
};

export function GuidanceTriggerButton({
  label,
  onClick,
  icon: Icon,
  mobileIconOnly = false,
}: {
  label: string;
  onClick: () => void;
  icon: LucideIcon;
  mobileIconOnly?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      aria-label={label}
      variant="paper"
      size="compact"
      className={`${mobileIconOnly ? "size-12 px-0 sm:h-auto sm:w-auto sm:px-4" : ""} shrink-0`}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[rgba(255,250,243,0.76)] text-[var(--champagne-deep)]">
        <Icon className="size-3.5" />
      </span>
      <span className={mobileIconOnly ? "hidden sm:inline" : undefined}>
        {label}
      </span>
    </Button>
  );
}

export function HelpTriggerButton(props: Omit<Parameters<typeof GuidanceTriggerButton>[0], "icon">) {
  return <GuidanceTriggerButton {...props} icon={HelpCircle} />;
}

export function GuidanceDialog({
  open,
  onClose,
  closeLabel,
  eyebrow,
  title,
  body,
  steps,
  cards,
  footer,
  action,
}: GuidanceDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const [exiting, setExiting] = useState(false);
  const dialogActive = open || exiting;

  useBodyScrollLock(dialogActive);
  useAccessibleDialog({
    open: dialogActive,
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose,
  });

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence onExitComplete={() => setExiting(false)}>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-[rgba(31,23,18,0.42)] px-4 py-6 backdrop-blur-sm"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          onAnimationStart={() => setExiting(true)}
        >
          <div className="absolute inset-0 cursor-default" aria-hidden="true" onClick={onClose} />
          <motion.div
            ref={dialogRef}
            className="relative z-10 w-full max-w-[34rem] overflow-hidden rounded-[30px] border border-white/75 bg-[var(--paper-soft)] shadow-[0_28px_80px_rgba(31,23,18,0.24)]"
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            aria-describedby="help-description"
            tabIndex={-1}
          >
        <div
          className="max-h-[calc(100dvh-3rem)] overflow-y-auto p-6"
          data-scroll-lock-allow="true"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow text-[var(--champagne-deep)]">{eyebrow}</p>
              <h3
                id="help-title"
                className="mt-2 font-display text-fluid-heading font-semibold text-balance text-[var(--ink)]"
              >
                {title}
              </h3>
            </div>
            <Button
              ref={closeButtonRef}
              onClick={onClose}
              variant="paper"
              size="icon"
              className="!size-11 !min-h-11"
              aria-label={closeLabel}
            >
              <X className="size-4" />
            </Button>
          </div>

          <p id="help-description" className="mt-5 text-sm leading-7 text-[var(--ink-soft)]">{body}</p>

          {steps.length > 0 ? (
            <ol className="mt-5 grid gap-3">
              {steps.map((step, index) => (
                <li
                  key={step}
                  className="grid grid-cols-[2rem_1fr] gap-3 rounded-2xl border border-[var(--line)] bg-white/54 p-3 text-sm font-semibold"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-[var(--ink)] text-xs text-[var(--paper-soft)]">
                    {index + 1}
                  </span>
                  <span className="self-center leading-snug">{step}</span>
                </li>
              ))}
            </ol>
          ) : null}

          {cards && cards.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {cards.map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-[rgba(139,107,63,0.18)] bg-[rgba(255,250,243,0.68)] p-3"
                >
                  <p className="text-sm font-extrabold text-[var(--ink)]">{card.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{card.body}</p>
                </div>
              ))}
            </div>
          ) : null}

          {footer ? (
            <p className="mt-5 rounded-2xl border border-[var(--line)] bg-white/50 px-3 py-2 text-xs font-bold leading-5 text-[var(--ink-soft)]">
              {footer}
            </p>
          ) : null}

          {action ? (
            <a
              href={action.href}
              target="_blank"
              rel="noreferrer"
              aria-label={action.ariaLabel}
              className="focus-ring mt-5 inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 rounded-full border border-[rgba(139,107,63,0.22)] bg-[rgba(255,250,243,0.86)] px-4 py-2.5 text-[0.78rem] font-extrabold tracking-[0.01em] text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_10px_24px_rgba(58,40,25,0.09)] transition hover:border-[rgba(139,107,63,0.4)] hover:bg-[var(--paper-soft)] motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.975]"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              {action.label}
            </a>
          ) : null}
        </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
