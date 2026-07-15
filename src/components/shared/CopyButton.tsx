"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonStyles, type ButtonSize, type ButtonVariant } from "@/components/shared/Button";

type CopyButtonProps = {
  text: string;
  copyLabel: string;
  copiedLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  disabled?: boolean;
  title?: string;
  onCopied?: () => void;
  onCopyError?: () => void;
};

export function CopyButton({
  text,
  copyLabel,
  copiedLabel,
  variant = "ink",
  size = "default",
  fullWidth = false,
  className = "",
  disabled = false,
  title,
  onCopied,
  onCopyError,
}: CopyButtonProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const copied = copiedText === text;

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      onCopied?.();
      if (copiedTimer.current !== null) {
        window.clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = window.setTimeout(() => setCopiedText(null), 1400);
    } catch {
      setCopiedText(null);
      onCopyError?.();
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      data-app-button={variant}
      className={buttonStyles({
        variant,
        size,
        fullWidth,
        className: `copy-btn ${copied ? "copied" : ""} ${className}`,
      })}
      onClick={() => void copy()}
    >
      <span className="copy-icon relative grid size-4 place-items-center" aria-hidden="true">
        <Copy
          className={`ic-copy absolute size-4 transition-all duration-200 ${
            copied ? "scale-75 opacity-0" : "scale-100 opacity-100"
          }`}
        />
        <Check
          className={`ic-check absolute size-4 transition-all duration-200 ${
            copied ? "scale-100 opacity-100" : "scale-75 opacity-0"
          }`}
        />
      </span>
      <span>{copied ? copiedLabel : copyLabel}</span>
    </button>
  );
}
