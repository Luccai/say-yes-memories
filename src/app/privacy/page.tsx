"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useCopy } from "@/lib/i18n-client";

export default function PrivacyPage() {
  const { privacy } = useCopy();

  return (
    <main className="min-h-dvh bg-[var(--paper)] px-4 py-6 text-[var(--ink)] sm:px-6 sm:py-10">
      <article className="mx-auto w-full max-w-3xl overflow-hidden rounded-[34px] border border-[var(--line)] bg-white/72 shadow-[0_24px_80px_rgba(64,47,34,0.10)]">
        <header className="border-b border-[var(--line)] bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(243,226,205,0.70))] px-6 py-8 sm:px-10 sm:py-12">
          <div className="mb-5 inline-flex size-12 items-center justify-center rounded-full border border-[var(--champagne)] bg-white/72">
            <ShieldCheck aria-hidden="true" className="size-5 text-[var(--rosewood)]" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--rosewood)]">
            {privacy.eyebrow}
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">
            {privacy.title}
          </h1>
          <p className="mt-3 text-sm font-semibold text-[var(--ink-soft)]">
            {privacy.updated}
          </p>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--ink-soft)]">
            {privacy.intro}
          </p>
        </header>

        <div className="grid gap-4 p-4 sm:p-8">
          {privacy.sections.map((section) => (
            <section
              key={section.title}
              className="rounded-[26px] border border-[var(--line)] bg-[var(--paper-soft)]/70 p-5 sm:p-6"
            >
              <h2 className="font-serif text-2xl">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--ink-soft)]">
                {section.body}
              </p>
            </section>
          ))}

          <a
            href="https://www.cloudflare.com/en-gb/turnstile-privacy-policy/"
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--line)] bg-white/72 px-5 py-3 text-center text-sm font-extrabold transition hover:bg-white"
          >
            {privacy.turnstileLink}
          </a>
          <Link
            href="/login"
            className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-extrabold text-[var(--paper-soft)] transition hover:bg-black motion-safe:active:scale-[0.985]"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {privacy.back}
          </Link>
        </div>
      </article>
    </main>
  );
}
