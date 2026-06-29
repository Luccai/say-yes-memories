"use client";

import { HelpCircle, X } from "lucide-react";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

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
};

export function HelpTriggerButton({
  label,
  onClick,
  mobileIconOnly = false,
}: {
  label: string;
  onClick: () => void;
  mobileIconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[rgba(139,107,63,0.22)] bg-white/70 px-2.5 py-2 text-[0.82rem] font-extrabold text-[var(--ink)] shadow-[0_10px_24px_rgba(58,40,25,0.1)] transition hover:bg-white active:scale-[0.99] sm:px-3.5 sm:text-sm"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[rgba(255,250,243,0.76)] text-[var(--champagne-deep)]">
        <HelpCircle className="size-3.5" />
      </span>
      <span className={mobileIconOnly ? "hidden sm:inline" : undefined}>
        {label}
      </span>
    </button>
  );
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
}: GuidanceDialogProps) {
  useBodyScrollLock(open);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-[rgba(31,23,18,0.42)] px-4 py-6 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 w-full max-w-[34rem] overflow-hidden rounded-[30px] border border-white/75 bg-[var(--paper-soft)] shadow-[0_28px_80px_rgba(31,23,18,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
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
            <button
              type="button"
              onClick={onClose}
              className="focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-white/66 transition hover:bg-white"
              aria-label={closeLabel}
            >
              <X className="size-4" />
            </button>
          </div>

          <p className="mt-5 text-sm leading-7 text-[var(--ink-soft)]">{body}</p>

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
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
