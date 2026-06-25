"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, LockKeyhole, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import type { Wedding } from "@/lib/types";
import { BrandMark } from "@/components/shared/BrandMark";
import { GuidanceDialog, HelpTriggerButton } from "@/components/shared/GuidanceDialog";
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
                <HelpTriggerButton label={text.help} onClick={() => setHelpOpen(true)} />
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
      <GuidanceDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        closeLabel={text.close}
        eyebrow={text.login.helpEyebrow}
        title={text.login.helpTitle}
        body={text.login.helpBody}
        steps={text.login.steps}
        cards={text.login.helpCards}
        footer={text.login.helpFooter}
      />
    </main>
  );
}
