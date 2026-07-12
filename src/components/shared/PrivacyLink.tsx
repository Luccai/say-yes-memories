"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useCopy } from "@/lib/i18n-client";

export function PrivacyLink({ className = "" }: { className?: string }) {
  const text = useCopy();

  return (
    <Link
      href="/privacy"
      className={`focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-4 py-3 text-xs font-bold text-[var(--ink-soft)] transition hover:bg-white/60 hover:text-[var(--ink)] ${className}`}
    >
      <ShieldCheck aria-hidden="true" className="size-4" />
      {text.privacy.link}
    </Link>
  );
}
