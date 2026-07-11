"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "ink" | "paper" | "quiet" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  ink: "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-soft)] hover:bg-black",
  paper:
    "border-[var(--line)] bg-white/68 text-[var(--ink)] hover:border-[var(--champagne)] hover:bg-white",
  quiet:
    "border-transparent bg-transparent text-[var(--ink-soft)] hover:bg-white/55 hover:text-[var(--ink)]",
  danger:
    "border-[rgba(124,58,49,0.22)] bg-white/68 text-[var(--rosewood)] hover:bg-white",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "ink",
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
        className={`focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-extrabold transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55 ${variants[variant]} ${
          fullWidth ? "w-full" : ""
        } ${className}`}
        {...props}
      >
        {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
        {children}
      </button>
    );
  },
);
