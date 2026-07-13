"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CalendarDays,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import type { PublicWedding } from "@/lib/types";
import { BrandMark } from "@/components/shared/BrandMark";
import { Button } from "@/components/shared/Button";
import {
  GuidanceDialog,
  GuidanceTriggerButton,
  HelpTriggerButton,
} from "@/components/shared/GuidanceDialog";
import { MediaOrb } from "@/components/shared/MediaOrb";
import {
  forgetRememberedMembership,
  readRememberedMembership,
  rememberMembership,
  type RememberedMembership,
} from "@/lib/auth/device-hint";
import { useAuthCopy, useCopy } from "@/lib/i18n-client";

type LoginMode = "activate" | "token" | "recover" | "remembered";

type AuthForm = {
  brideName: string;
  groomName: string;
  token: string;
  password: string;
  passwordConfirm: string;
  eventDate: string;
  timezone: string;
};

const ACTIVATION_RETRY_KEY = "sayyes.activation.retry-key.v1";

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createBrowserSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function activationRetryKey() {
  try {
    const existing = window.sessionStorage.getItem(ACTIVATION_RETRY_KEY);
    if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) {
      return existing;
    }
    const created = createBrowserSecret();
    window.sessionStorage.setItem(ACTIVATION_RETRY_KEY, created);
    return created;
  } catch {
    return createBrowserSecret();
  }
}

function clearActivationRetryKey() {
  try {
    window.sessionStorage.removeItem(ACTIVATION_RETRY_KEY);
  } catch {
    // Best effort only.
  }
}

export function LoginExperience({
  initialSession = null,
}: {
  initialSession?: PublicWedding | null;
}) {
  const text = useCopy();
  const authText = useAuthCopy();
  const [form, setForm] = useState<AuthForm>({
    brideName: "",
    groomName: "",
    token: "",
    password: "",
    passwordConfirm: "",
    eventDate: "",
    timezone: "UTC",
  });
  const [activeSession] = useState<PublicWedding | null>(initialSession);
  const [remembered, setRemembered] = useState<RememberedMembership | null>(null);
  const [mode, setMode] = useState<LoginMode>("activate");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setForm((current) => ({ ...current, timezone }));
      }
    });

    if (initialSession) {
      rememberMembership(initialSession);
    } else {
      const deviceHint = readRememberedMembership();
      queueMicrotask(() => {
        if (!active) return;
        setRemembered(deviceHint);
        if (deviceHint) {
          setMode("remembered");
        }
      });
    }

    return () => {
      active = false;
    };
  }, [initialSession]);

  function chooseMode(nextMode: LoginMode) {
    setMode(nextMode);
    setError("");
    setForm((current) => ({
      ...current,
      password: "",
      passwordConfirm: "",
    }));
  }

  function errorMessage(code?: string) {
    if (code === "PASSWORD_MISMATCH") return authText.passwordMismatch;
    if (code === "WEAK_PASSWORD") return authText.weakPassword;
    if (code === "EVENT_DATE_IN_PAST") return authText.pastDate;
    if (code === "SETUP_REQUIRED") return authText.setupRequired;
    if (code === "TOO_MANY_ATTEMPTS") return authText.tooManyAttempts;
    return authText.invalid;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const endpoint =
        mode === "activate"
          ? "/api/auth/activate"
          : mode === "recover"
            ? "/api/auth/recover"
            : "/api/auth/login";
      const body =
        mode === "activate"
          ? { ...form, activationKey: activationRetryKey() }
          : mode === "remembered"
            ? { slug: remembered?.slug, password: form.password }
            : mode === "token"
              ? { token: form.token, password: form.password }
              : {
                  token: form.token,
                  password: form.password,
                  passwordConfirm: form.passwordConfirm,
                };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        wedding?: PublicWedding;
        code?: string;
      };

      if (!response.ok || !payload.wedding) {
        if (payload.code === "SETUP_REQUIRED") {
          chooseMode("activate");
        }
        setError(errorMessage(payload.code));
        return;
      }

      rememberMembership(payload.wedding);
      clearActivationRetryKey();
      window.location.assign("/admin");
    } catch {
      setError(authText.invalid);
    } finally {
      setSubmitting(false);
    }
  }

  function forgetDevice() {
    forgetRememberedMembership();
    setRemembered(null);
    chooseMode("activate");
  }

  const inputClass =
    "focus-ring min-h-12 rounded-[18px] border border-[var(--line)] bg-[#f1e8db] px-4 py-3 !text-[16px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)]/48";

  return (
    <main className="min-h-[100dvh] px-3 py-3 text-[var(--ink)] sm:px-6 sm:py-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-[48rem] items-center justify-center overflow-hidden rounded-[30px] border border-white/65 bg-[rgba(255,250,243,0.74)] backdrop-blur-xl sm:min-h-[calc(100dvh-3rem)] sm:rounded-[38px]">
        <section className="w-full p-4 sm:p-8 lg:p-12">
          <div className="mx-auto w-full max-w-[34rem]">
            <div className="mb-6 flex items-start justify-between gap-3 sm:mb-8 sm:items-center">
              <BrandMark />
              <div className="flex shrink-0 items-center gap-2">
                <HelpTriggerButton
                  label={text.help}
                  onClick={() => setHelpOpen(true)}
                  mobileIconOnly
                />
                <GuidanceTriggerButton
                  label={text.privacy.link}
                  onClick={() => setPrivacyOpen(true)}
                  icon={ShieldCheck}
                  mobileIconOnly
                />
              </div>
            </div>

            {activeSession ? (
              <div
                className="rounded-[30px] border border-white/80 bg-[var(--paper-soft)] p-6 text-center shadow-[var(--shadow-soft)] sm:p-8"
              >
                <MediaOrb
                  media={activeSession.profileMedia}
                  label={activeSession.coupleName}
                  className="mx-auto h-40 w-32"
                />
                <p className="eyebrow mt-6 text-[var(--champagne-deep)]">
                  {text.login.welcomeBack}
                </p>
                <h1 className="mt-2 font-display text-fluid-title font-semibold">
                  {activeSession.coupleName}
                </h1>
                <Link
                  href="/admin"
                  className="focus-ring mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-extrabold text-[var(--paper-soft)] transition motion-safe:active:scale-[0.985]"
                >
                  {text.login.enterStudio}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            ) : (
              <form
                key={mode}
                onSubmit={handleSubmit}
                className="rounded-[30px] border border-white/80 bg-[var(--paper-soft)] p-5 shadow-[var(--shadow-soft)] sm:p-8"
              >
                {mode === "remembered" && remembered ? (
                  <>
                    <div className="text-center">
                      <MediaOrb
                        media={remembered.profileMedia}
                        label={remembered.coupleName}
                        className="mx-auto h-36 w-28"
                      />
                      <p className="eyebrow mt-5 text-[var(--champagne-deep)]">
                        {authText.remembered}
                      </p>
                      <h1 className="mt-2 font-display text-[2.15rem] font-semibold leading-none">
                        {remembered.coupleName}
                      </h1>
                      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--ink-soft)]">
                        {authText.rememberedBody}
                      </p>
                    </div>
                    <label className="mt-6 grid gap-2 text-sm font-semibold">
                      {authText.password}
                      <input
                        className={inputClass}
                        type="password"
                        value={form.password}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, password: event.target.value }))
                        }
                        autoComplete="current-password"
                        minLength={10}
                        required
                        autoFocus
                      />
                    </label>
                    <Button
                      type="submit"
                      loading={submitting}
                      className="mt-5 min-w-[12.5rem] max-w-full"
                    >
                      {authText.signIn}
                      <ArrowRight className="size-4" />
                    </Button>
                    <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      <Button variant="quiet" onClick={() => chooseMode("token")}>
                        <KeyRound className="size-4" />
                        {authText.useToken}
                      </Button>
                      <Button variant="quiet" onClick={forgetDevice}>
                        {authText.forgetDevice}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      {mode === "recover" ? (
                        <Button
                          variant="quiet"
                          aria-label={authText.back}
                          className="-ml-2 min-h-11 px-3"
                          onClick={() => chooseMode(remembered ? "remembered" : "token")}
                        >
                          <ArrowLeft className="size-4" />
                        </Button>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
                          {mode === "recover" ? (
                            <ShieldCheck className="size-4" />
                          ) : (
                            <LockKeyhole className="size-4" />
                          )}
                          {mode === "activate" ? text.login.tokenActivation : authText.returning}
                        </p>
                        <h1 className="mt-3 font-display text-fluid-title font-semibold leading-[0.98]">
                          {mode === "activate"
                            ? text.login.title
                            : mode === "recover"
                              ? authText.recoverTitle
                              : authText.returning}
                        </h1>
                        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
                          {mode === "activate"
                            ? authText.firstSetupBody
                            : mode === "recover"
                              ? authText.recoverBody
                              : authText.returningBody}
                        </p>
                      </div>
                    </div>

                    {mode !== "recover" ? (
                      <div className="mt-6 grid grid-cols-2 rounded-full border border-[var(--line)] bg-white/48 p-1">
                        <Button
                          variant={mode === "activate" ? "ink" : "quiet"}
                          className="min-h-11 whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm"
                          onClick={() => chooseMode("activate")}
                        >
                          {authText.firstSetup}
                        </Button>
                        <Button
                          variant={mode === "token" ? "ink" : "quiet"}
                          className="min-h-11 whitespace-nowrap px-2 text-xs sm:px-3 sm:text-sm"
                          onClick={() => chooseMode("token")}
                        >
                          {authText.returning}
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-6 grid gap-4">
                      {mode === "activate" ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className="grid gap-2 text-sm font-semibold">
                            {text.login.bride}
                            <input
                              className={inputClass}
                              value={form.brideName}
                              onChange={(event) =>
                                setForm((current) => ({ ...current, brideName: event.target.value }))
                              }
                              autoComplete="given-name"
                              maxLength={80}
                              required
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-semibold">
                            {text.login.groom}
                            <input
                              className={inputClass}
                              value={form.groomName}
                              onChange={(event) =>
                                setForm((current) => ({ ...current, groomName: event.target.value }))
                              }
                              autoComplete="given-name"
                              maxLength={80}
                              required
                            />
                          </label>
                        </div>
                      ) : null}

                      <label className="grid gap-2 text-sm font-semibold">
                        {text.login.token}
                        <input
                          className={`${inputClass} uppercase placeholder:normal-case`}
                          value={form.token}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, token: event.target.value }))
                          }
                          autoComplete="one-time-code"
                          required
                        />
                      </label>

                      {mode === "activate" ? (
                        <label className="grid gap-2 text-sm font-semibold">
                          {authText.eventDate}
                          <span className="relative block min-w-0 w-full">
                            <CalendarDays className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--champagne-deep)]" />
                            <input
                              className={`${inputClass} block min-w-0 w-full max-w-full pl-11`}
                              type="date"
                              min={localToday()}
                              value={form.eventDate}
                              onChange={(event) =>
                                setForm((current) => ({ ...current, eventDate: event.target.value }))
                              }
                              required
                            />
                          </span>
                          <span className="text-xs font-normal leading-5 text-[var(--ink-soft)]">
                            {authText.uploadsOpen}
                          </span>
                        </label>
                      ) : null}

                      <label className="grid gap-2 text-sm font-semibold">
                        {authText.password}
                        <input
                          className={inputClass}
                          type="password"
                          value={form.password}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, password: event.target.value }))
                          }
                          autoComplete={mode === "token" ? "current-password" : "new-password"}
                          minLength={10}
                          maxLength={256}
                          required
                        />
                        {mode !== "token" ? (
                          <span className="text-xs font-normal text-[var(--ink-soft)]">
                            {authText.passwordHint}
                          </span>
                        ) : null}
                      </label>

                      {mode !== "token" ? (
                        <label className="grid gap-2 text-sm font-semibold">
                          {authText.passwordConfirm}
                          <input
                            className={inputClass}
                            type="password"
                            value={form.passwordConfirm}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, passwordConfirm: event.target.value }))
                            }
                            autoComplete="new-password"
                            minLength={10}
                            maxLength={256}
                            required
                          />
                        </label>
                      ) : null}
                    </div>

                    <Button
                      type="submit"
                      loading={submitting}
                      className="mt-6 min-w-[12.5rem] max-w-full"
                    >
                      {mode === "activate"
                        ? authText.activate
                        : mode === "recover"
                          ? authText.reset
                          : authText.signIn}
                      <ArrowRight className="size-4" />
                    </Button>

                    {mode === "token" ? (
                      <Button
                        variant="quiet"
                        className="mt-2"
                        onClick={() => chooseMode("recover")}
                      >
                        {authText.forgot}
                      </Button>
                    ) : null}
                  </>
                )}

                {error ? (
                  <p
                    role="alert"
                    aria-live="polite"
                    className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                  >
                    {error}
                  </p>
                ) : null}

                <Link
                  href="/admin/mary-john"
                  data-login-demo-action="true"
                  data-demo-icon="camera"
                  className="focus-ring mt-4 inline-flex min-h-12 w-fit max-w-full items-center justify-center gap-2 self-start rounded-full border border-[var(--line)] bg-white/62 px-5 py-3 text-sm font-extrabold transition hover:bg-white motion-safe:active:scale-[0.985]"
                >
                  <Camera aria-hidden="true" className="size-4 text-[var(--champagne-deep)]" />
                  {text.login.demo}
                </Link>
              </form>
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
      <GuidanceDialog
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        closeLabel={text.close}
        eyebrow={text.privacy.eyebrow}
        title={text.privacy.title}
        body={text.privacy.intro}
        steps={[]}
        cards={text.privacy.sections}
        footer={text.privacy.updated}
        action={{
          href: "https://www.cloudflare.com/en-gb/turnstile-privacy-policy/",
          label: text.privacy.turnstileButton,
          ariaLabel: text.privacy.turnstileLink,
        }}
      />
    </main>
  );
}
