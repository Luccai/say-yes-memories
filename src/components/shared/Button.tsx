"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "ink" | "paper" | "quiet" | "premium" | "danger";
export type ButtonSize = "default" | "compact" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  ink:
    "border-[rgba(31,23,18,0.92)] bg-[var(--ink)] text-[var(--paper-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_26px_rgba(31,23,18,0.18)] hover:bg-[#120d0a] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_16px_34px_rgba(31,23,18,0.22)]",
  paper:
    "border-[rgba(139,107,63,0.22)] bg-[rgba(255,250,243,0.86)] text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_10px_24px_rgba(58,40,25,0.09)] hover:border-[rgba(139,107,63,0.4)] hover:bg-[var(--paper-soft)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_14px_30px_rgba(58,40,25,0.13)]",
  quiet:
    "border-transparent bg-transparent text-[var(--ink-soft)] shadow-none hover:bg-[rgba(255,250,243,0.64)] hover:text-[var(--ink)]",
  premium:
    "border-[rgba(139,107,63,0.44)] bg-[var(--champagne)] text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.48),0_12px_28px_rgba(139,107,63,0.22)] hover:border-[rgba(139,107,63,0.64)] hover:bg-[var(--champagne)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_16px_34px_rgba(139,107,63,0.28)]",
  danger:
    "border-[rgba(140,81,68,0.24)] bg-[rgba(255,250,243,0.82)] text-[var(--rosewood)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_24px_rgba(98,47,39,0.08)] hover:border-[rgba(140,81,68,0.42)] hover:bg-[#fff8f4]",
};

const sizes: Record<ButtonSize, string> = {
  default: "min-h-12 px-5 py-3 text-sm",
  compact: "min-h-11 px-4 py-2.5 text-[0.78rem]",
  icon: "size-12 min-h-12 shrink-0 p-0",
};

export function buttonStyles({
  variant = "ink",
  size = "default",
  fullWidth = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  return `focus-ring group/button relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border font-extrabold tracking-[0.01em] transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.975] disabled:pointer-events-none disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "ink",
      size = "default",
      loading = false,
      fullWidth = false,
      disabled,
      className = "",
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-app-button={variant}
        className={buttonStyles({ variant, size, fullWidth, className })}
        {...props}
      >
        {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
        {children}
      </button>
    );
  },
);
