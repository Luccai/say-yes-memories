"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, HelpCircle, Loader2, LockKeyhole, Sparkles, X } from "lucide-react";
import { motion } from "motion/react";
import type { Wedding } from "@/lib/types";
import { BrandMark } from "@/components/shared/BrandMark";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { localizedError, useCopy } from "@/lib/i18n";

type ActivationForm = {
  brideName: string;
  groomName: string;
  token: string;
};

export function LoginExperience() {
  const text = useCopy();
  const [form, setForm] = useState<ActivationForm>({
    brideName: "",
    groomName: "",
    token: "",
  });
  const [returningWedding, setReturningWedding] = useState<Wedding | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = (await response.json()) as { wedding: Wedding | null };

        if (active) {
          setReturningWedding(payload.wedding);
        }
      } finally {
        if (active) {
          setLoadingSession(false);
        }
      }
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { wedding?: Wedding; message?: string };

      if (!response.ok || !payload.wedding) {
        setError(localizedError(payload.message, text.errors, text.errors.signInFailed));
        return;
      }

      window.location.href = "/admin";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] px-4 py-5 text-[var(--ink)] sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-[44rem] items-center justify-center overflow-hidden rounded-[34px] border border-white/65 bg-[rgba(255,250,243,0.72)] backdrop-blur-xl">
        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-12">
          <div className="w-full max-w-[32rem]">
            <div className="mb-8">
              <div className="flex items-start justify-between gap-3 sm:items-center sm:gap-4">
                <BrandMark />
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[rgba(139,107,63,0.22)] bg-white/70 px-2.5 py-2 text-[0.82rem] font-extrabold text-[var(--ink)] shadow-[0_10px_24px_rgba(58,40,25,0.1)] transition hover:bg-white active:scale-[0.99] sm:px-3.5 sm:text-sm"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[rgba(255,250,243,0.76)] text-[var(--champagne-deep)]">
                    <HelpCircle className="size-3.5" />
                  </span>
                  <span>{text.help}</span>
                </button>
              </div>
            </div>

            {loadingSession ? (
              <div className="grid min-h-[28rem] place-items-center rounded-[30px] border border-[var(--line)] bg-white/58">
                <Loader2 className="size-8 animate-spin text-[var(--champagne-deep)]" />
              </div>
            ) : returningWedding ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[32px] border border-white/80 bg-[var(--paper-soft)] p-7 shadow-none sm:shadow-[0_24px_60px_rgba(58,40,25,0.13)]"
              >
                <MediaOrb
                  media={returningWedding.profileMedia}
                  label={returningWedding.coupleName}
                  className="mx-auto h-40 w-32"
                />
                <div className="mt-7 text-center">
                  <p className="eyebrow text-[var(--champagne-deep)]">
                    {text.login.welcomeBack}
                  </p>
                  <h2 className="mt-3 font-display text-fluid-title font-semibold text-balance text-[var(--ink)]">
                    {returningWedding.coupleName}
                  </h2>
                  <Link
                    href="/admin"
                    className="focus-ring mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[var(--ink)] px-6 py-4 text-sm font-bold text-[var(--paper-soft)] shadow-none transition hover:translate-y-[-1px] hover:bg-black sm:shadow-[0_16px_40px_rgba(31,23,18,0.22)]"
                  >
                    {text.login.enterStudio}
                    <ArrowRight className="size-4" />
                  </Link>
                  <Link
                    href="/admin/mary-john"
                    className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-3 rounded-full border border-[var(--line)] bg-white/62 px-6 py-4 text-sm font-bold text-[var(--ink)] transition hover:translate-y-[-1px] hover:bg-white"
                  >
                    <Sparkles className="size-4 text-[var(--champagne-deep)]" />
                    {text.login.demo}
                  </Link>
                </div>
              </motion.div>
            ) : (
              <motion.form
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSubmit}
                className="rounded-[32px] border border-white/80 bg-[var(--paper-soft)] p-6 shadow-none sm:p-8 sm:shadow-[0_24px_60px_rgba(58,40,25,0.13)]"
              >
                <div className="mb-8">
                  <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
                    <LockKeyhole className="size-4" />
                    {text.login.tokenActivation}
                  </p>
                  <h2 className="mt-3 font-display text-fluid-title font-semibold text-balance text-[var(--ink)]">
                    {text.login.title}
                  </h2>
                </div>

                <div className="grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold">
                    {text.login.bride}
                    <input
                      className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 !text-[16px] outline-none transition placeholder:text-[var(--ink-soft)]/50"
                      value={form.brideName}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, brideName: event.target.value }))
                      }
                      placeholder="Mary"
                      autoComplete="given-name"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    {text.login.groom}
                    <input
                      className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 !text-[16px] outline-none transition placeholder:text-[var(--ink-soft)]/50"
                      value={form.groomName}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, groomName: event.target.value }))
                      }
                      placeholder="John"
                      autoComplete="given-name"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    {text.login.token}
                    <input
                      className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 !text-[16px] uppercase outline-none transition placeholder:normal-case placeholder:text-[var(--ink-soft)]/50"
                      value={form.token}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, token: event.target.value }))
                      }
                      placeholder="SYD-XXXXXX-XXXXXX-XXXXXX"
                      required
                    />
                  </label>
                </div>

                {error ? (
                  <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[var(--ink)] px-6 py-4 text-sm font-bold text-[var(--paper-soft)] shadow-none transition hover:translate-y-[-1px] hover:bg-black disabled:opacity-60 sm:shadow-[0_16px_40px_rgba(31,23,18,0.22)]"
                >
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  {text.login.create}
                  <ArrowRight className="size-4" />
                </button>
                <Link
                  href="/admin/mary-john"
                  className="focus-ring mt-3 inline-flex w-full items-center justify-center gap-3 rounded-full border border-[var(--line)] bg-white/62 px-6 py-4 text-sm font-bold text-[var(--ink)] transition hover:translate-y-[-1px] hover:bg-white"
                >
                  <Sparkles className="size-4 text-[var(--champagne-deep)]" />
                  {text.login.demo}
                </Link>
              </motion.form>
            )}
          </div>
        </section>
      </div>
      {helpOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(31,23,18,0.42)] px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-[34rem] rounded-[30px] border border-white/75 bg-[var(--paper-soft)] p-6 shadow-[0_28px_80px_rgba(31,23,18,0.24)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-[var(--champagne-deep)]">
                  {text.login.helpEyebrow}
                </p>
                <h3
                  id="help-title"
                  className="mt-2 font-display text-fluid-heading font-semibold text-balance text-[var(--ink)]"
                >
                  {text.login.helpTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="focus-ring grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-white/66 transition hover:bg-white"
                aria-label={text.close}
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-5 text-sm leading-7 text-[var(--ink-soft)]">{text.login.helpBody}</p>
            <ol className="mt-5 grid gap-3">
              {text.login.steps.map((step, index) => (
                <li
                  key={step}
                  className="grid grid-cols-[2rem_1fr] gap-3 rounded-2xl border border-[var(--line)] bg-white/54 p-3 text-sm font-semibold"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-[var(--ink)] text-xs text-[var(--paper-soft)]">
                    {index + 1}
                  </span>
                  <span className="self-center">{step}</span>
                </li>
              ))}
            </ol>
          </motion.div>
        </div>
      ) : null}
    </main>
  );
}
