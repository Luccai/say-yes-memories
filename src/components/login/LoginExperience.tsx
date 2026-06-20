"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, LockKeyhole, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import type { Wedding } from "@/lib/types";
import { BrandMark } from "@/components/shared/BrandMark";
import { MediaOrb } from "@/components/shared/MediaOrb";

type ActivationForm = {
  brideName: string;
  groomName: string;
  token: string;
};

export function LoginExperience() {
  const [form, setForm] = useState<ActivationForm>({
    brideName: "",
    groomName: "",
    token: "",
  });
  const [returningWedding, setReturningWedding] = useState<Wedding | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  const slugPreview = useMemo(() => {
    const normalize = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[çÇ]/g, "c")
        .replace(/[ğĞ]/g, "g")
        .replace(/[ıİI]/g, "i")
        .replace(/[öÖ]/g, "o")
        .replace(/[şŞ]/g, "s")
        .replace(/[üÜ]/g, "u")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const bride = normalize(form.brideName) || "bride";
    const groom = normalize(form.groomName) || "groom";
    return `/${bride}-${groom}`;
  }, [form.brideName, form.groomName]);

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
        setError(payload.message ?? "Giriş yapılamadı.");
        return;
      }

      window.location.href = "/admin";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 text-[var(--ink)] sm:px-6 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-7xl overflow-hidden rounded-[34px] border border-white/65 bg-[rgba(255,250,243,0.72)] shadow-[var(--shadow-soft)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="paper-grain relative flex min-h-[42rem] flex-col justify-between overflow-hidden bg-[var(--ink)] p-6 text-[var(--paper-soft)] sm:p-10">
          <div className="absolute inset-0 opacity-35">
            <div className="absolute inset-x-[-18%] top-[-18%] h-[30rem] rounded-full bg-[radial-gradient(circle,#c7a66f,transparent_64%)]" />
            <div className="absolute bottom-[-22%] right-[-18%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,#7e8f78,transparent_66%)]" />
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <BrandMark compact />
            <span className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/76">
              Private wedding studio
            </span>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative z-10 max-w-2xl"
          >
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-white/78">
              <Sparkles className="size-4 text-[var(--champagne)]" />
              Etsy couples only
            </p>
            <h1 className="font-[var(--font-display)] text-6xl font-semibold leading-[0.94] text-white sm:text-7xl lg:text-8xl">
              Your wedding memories, gathered with quiet luxury.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-white/72 sm:text-lg">
              Activate your private QR studio, place the code on your tables, and let guests
              send photos, videos, voice notes, and tiny moments without downloading an app.
            </p>
          </motion.div>
          <div className="relative z-10 grid gap-3 text-sm text-white/72 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
              One token
              <span className="mt-1 block text-white">private access</span>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
              One link
              <span className="mt-1 block text-white">your names</span>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
              One gallery
              <span className="mt-1 block text-white">only for you</span>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-12">
          <div className="w-full max-w-[32rem]">
            <div className="mb-8">
              <BrandMark />
            </div>

            {loadingSession ? (
              <div className="grid min-h-[28rem] place-items-center rounded-[30px] border border-[var(--line)] bg-white/58">
                <Loader2 className="size-8 animate-spin text-[var(--champagne-deep)]" />
              </div>
            ) : returningWedding ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[32px] border border-white/80 bg-[var(--paper-soft)] p-7 shadow-[0_24px_60px_rgba(58,40,25,0.13)]"
              >
                <MediaOrb
                  media={returningWedding.profileMedia}
                  label={returningWedding.coupleName}
                  className="mx-auto h-40 w-32"
                />
                <div className="mt-7 text-center">
                  <p className="text-xs font-bold uppercase text-[var(--champagne-deep)]">
                    Welcome back
                  </p>
                  <h2 className="mt-2 font-[var(--font-display)] text-5xl font-semibold">
                    {returningWedding.coupleName}
                  </h2>
                  <p className="mt-3 text-sm text-[var(--ink-soft)]">
                    Your private guest link is{" "}
                    <span className="font-semibold text-[var(--ink)]">/{returningWedding.slug}</span>
                  </p>
                  <Link
                    href="/admin"
                    className="focus-ring mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[var(--ink)] px-6 py-4 text-sm font-bold text-[var(--paper-soft)] shadow-[0_16px_40px_rgba(31,23,18,0.22)] transition hover:translate-y-[-1px] hover:bg-black"
                  >
                    Stüdyoya gir
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </motion.div>
            ) : (
              <motion.form
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                onSubmit={handleSubmit}
                className="rounded-[32px] border border-white/80 bg-[var(--paper-soft)] p-6 shadow-[0_24px_60px_rgba(58,40,25,0.13)] sm:p-8"
              >
                <div className="mb-8">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--champagne-deep)]">
                    <LockKeyhole className="size-4" />
                    Token activation
                  </p>
                  <h2 className="mt-3 font-[var(--font-display)] text-5xl font-semibold leading-none">
                    Start your private studio.
                  </h2>
                </div>

                <div className="grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold">
                    Bride name
                    <input
                      className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 text-base outline-none transition placeholder:text-[var(--ink-soft)]/50"
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
                    Groom name
                    <input
                      className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 text-base outline-none transition placeholder:text-[var(--ink-soft)]/50"
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
                    Etsy token
                    <input
                      className="focus-ring rounded-2xl border border-[var(--line)] bg-[#f1e8db] px-4 py-4 text-base uppercase outline-none transition placeholder:normal-case placeholder:text-[var(--ink-soft)]/50"
                      value={form.token}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, token: event.target.value }))
                      }
                      placeholder="SYD-XXXXXX-XXXXXX-XXXXXX"
                      required
                    />
                  </label>
                </div>

                <div className="mt-5 rounded-2xl border border-[var(--line)] bg-white/52 p-4 text-sm text-[var(--ink-soft)]">
                  Your guest link preview:{" "}
                  <span className="font-semibold text-[var(--ink)]">{slugPreview}</span>
                </div>

                {error ? (
                  <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[var(--ink)] px-6 py-4 text-sm font-bold text-[var(--paper-soft)] shadow-[0_16px_40px_rgba(31,23,18,0.22)] transition hover:translate-y-[-1px] hover:bg-black disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  Create private studio
                  <ArrowRight className="size-4" />
                </button>
              </motion.form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
