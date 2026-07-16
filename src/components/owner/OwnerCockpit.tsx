"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  ArchiveX,
  HeartHandshake,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { BrandMark } from "@/components/shared/BrandMark";
import { Button } from "@/components/shared/Button";
import { OwnerAuditPanel } from "@/components/owner/OwnerAuditPanel";
import { OwnerCleanupPanel } from "@/components/owner/OwnerCleanupPanel";
import { OwnerCouplesPanel } from "@/components/owner/OwnerCouplesPanel";
import { OwnerOverviewPanel } from "@/components/owner/OwnerOverviewPanel";
import { OwnerSettingsPanel } from "@/components/owner/OwnerSettingsPanel";
import { OwnerSystemPanel } from "@/components/owner/OwnerSystemPanel";
import { OwnerTokensPanel } from "@/components/owner/OwnerTokensPanel";
import type { OwnerSection, OwnerSessionState } from "@/components/owner/types";
import { ownerApi, ownerInputClass } from "@/components/owner/utils";

const DEVICE_LABEL_KEY = "sayyes.owner.device-label.v1";

const sections: Array<{
  id: OwnerSection;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "Genel Bakış", shortLabel: "Özet", icon: LayoutDashboard },
  { id: "couples", label: "Çiftler", shortLabel: "Çiftler", icon: UsersRound },
  { id: "tokens", label: "Tokenlar", shortLabel: "Token", icon: KeyRound },
  { id: "audit", label: "Hareketler", shortLabel: "Hareket", icon: Activity },
  { id: "cleanup", label: "Temizlik", shortLabel: "Temizlik", icon: ArchiveX },
  { id: "settings", label: "Ayarlar", shortLabel: "Ayar", icon: Settings },
  { id: "system", label: "Sistem Durumu", shortLabel: "Sistem", icon: ShieldCheck },
];

function rememberedDeviceLabel() {
  if (typeof window === "undefined") return "Bu cihaz";
  try {
    return window.localStorage.getItem(DEVICE_LABEL_KEY) || "Mihail'in bilgisayarı";
  } catch {
    return "Bu cihaz";
  }
}

function rememberDeviceLabel(value: string) {
  try {
    window.localStorage.setItem(DEVICE_LABEL_KEY, value);
  } catch {
    // Private browsing can reject local storage.
  }
}

function OwnerAuthCard({
  mode,
  onAuthenticated,
}: {
  mode: "setup" | "login";
  onAuthenticated: () => Promise<void>;
}) {
  const [setupCode, setSetupCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("Bu cihaz");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(() => setDeviceLabel(rememberedDeviceLabel()));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await ownerApi(`/api/owner/${mode === "setup" ? "setup" : "login"}`, {
        method: "POST",
        body: JSON.stringify(
          mode === "setup"
            ? { setupCode, password, passwordConfirm, deviceLabel }
            : { password, deviceLabel },
        ),
      });
      rememberDeviceLabel(deviceLabel);
      await onAuthenticated();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setError(
        code === "TOO_MANY_ATTEMPTS"
          ? "Çok fazla deneme yapıldı. 15 dakika bekleyip tekrar dene."
          : mode === "setup"
            ? "Kurulum kodunu ve şifreleri kontrol et."
            : "Owner şifresi yanlış veya sistem şu an hazır değil.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center px-3 py-5 text-[var(--ink)] sm:px-6">
      <section className="w-full max-w-lg overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.88)] p-5 shadow-[0_28px_90px_rgba(58,40,25,0.14)] backdrop-blur-xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <BrandMark />
          <span className="rounded-full border border-[var(--line)] bg-white/64 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--champagne-deep)]">
            Owner
          </span>
        </div>
        <div className="mt-8">
          <p className="eyebrow text-[var(--champagne-deep)]">
            {mode === "setup" ? "Tek kullanımlık güvenli kurulum" : "Güvenli owner girişi"}
          </p>
          <h1 className="mt-3 font-display text-[2.25rem] font-semibold leading-none sm:text-5xl">
            {mode === "setup" ? "Kokpitini güvenle aç." : "Kontrol merkezine dön."}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
            {mode === "setup"
              ? "Bu ekran yalnızca bir kez çalışır. Yeni owner şifren veritabanında açık biçimde tutulmaz."
              : "Bu cihaz 90 gün boyunca kullanıldıkça güvenli biçimde hatırlanır; Ayarlar bölümünden tek tek kapatılabilir."}
          </p>
        </div>

        <form onSubmit={submit} className="mt-7 grid gap-4">
          {mode === "setup" ? (
            <label className="grid gap-2 text-sm font-bold">
              Tek kullanımlık kurulum kodu
              <input
                className={ownerInputClass}
                type="password"
                value={setupCode}
                onChange={(event) => setSetupCode(event.target.value)}
                autoComplete="one-time-code"
                required
              />
            </label>
          ) : null}
          <label className="grid gap-2 text-sm font-bold">
            {mode === "setup" ? "Yeni owner şifresi" : "Owner şifresi"}
            <input
              className={ownerInputClass}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
              minLength={12}
              maxLength={256}
              required
            />
            <span className="text-xs font-medium text-[var(--ink-soft)]">
              En az 12 karakter.
            </span>
          </label>
          {mode === "setup" ? (
            <label className="grid gap-2 text-sm font-bold">
              Şifreyi tekrar yaz
              <input
                className={ownerInputClass}
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
              />
            </label>
          ) : null}
          <label className="grid gap-2 text-sm font-bold">
            Bu cihazın adı
            <input
              className={ownerInputClass}
              value={deviceLabel}
              onChange={(event) => setDeviceLabel(event.target.value)}
              maxLength={80}
              required
            />
          </label>
          {error ? (
            <p role="alert" className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-[var(--rosewood)]">
              {error}
            </p>
          ) : null}
          <Button type="submit" fullWidth loading={submitting}>
            <ShieldCheck className="size-4" />
            {mode === "setup" ? "Güvenli kurulumu tamamla" : "Kokpiti aç"}
          </Button>
        </form>
      </section>
    </main>
  );
}

export function OwnerCockpit() {
  const [sessionState, setSessionState] = useState<OwnerSessionState>({ state: "loading" });
  const [activeSection, setActiveSection] = useState<OwnerSection>("overview");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  async function loadSession() {
    try {
      const state = await ownerApi<OwnerSessionState>("/api/owner/session");
      setSessionState(state);
    } catch {
      setSessionState({ state: "unavailable" });
    }
  }

  useEffect(() => {
    const previousLanguage = document.documentElement.lang || "en";
    document.documentElement.lang = "tr";
    queueMicrotask(() => void loadSession());
    const expired = () => setSessionState({ state: "login" });
    window.addEventListener("sayyes-owner-session-expired", expired);
    return () => {
      window.removeEventListener("sayyes-owner-session-expired", expired);
      if (document.documentElement.lang === "tr") {
        document.documentElement.lang = previousLanguage;
      }
    };
  }, []);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(false);
    try {
      const response = await fetch("/api/owner/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("OWNER_LOGOUT_FAILED");
      }
      setSessionState({ state: "login" });
    } catch {
      setLogoutError(true);
    } finally {
      setLoggingOut(false);
    }
  }

  if (sessionState.state === "loading") {
    return (
      <main className="grid min-h-[100dvh] place-items-center px-4 text-[var(--ink)]">
        <div className="w-full max-w-md animate-pulse rounded-[34px] border border-white/75 bg-white/45 p-8">
          <div className="h-24 rounded-[24px] bg-white/70" />
          <div className="mt-6 h-72 rounded-[28px] bg-white/60" />
        </div>
      </main>
    );
  }
  if (sessionState.state === "setup" || sessionState.state === "login") {
    return <OwnerAuthCard mode={sessionState.state} onAuthenticated={loadSession} />;
  }
  if (sessionState.state === "unavailable") {
    return (
      <main className="grid min-h-[100dvh] place-items-center px-4 text-[var(--ink)]">
        <section className="w-full max-w-md rounded-[32px] border border-white/75 bg-[var(--paper-soft)] p-6 text-center">
          <ShieldCheck className="mx-auto size-8 text-[var(--rosewood)]" />
          <h1 className="mt-4 font-display text-3xl font-semibold">Owner sistemi hazır değil.</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
            Veritabanı migration’ı veya ortam anahtarları eksik olabilir. Bu ekran güvenlik için kapalı kaldı.
          </p>
          <Button fullWidth className="mt-6" onClick={() => void loadSession()}>
            Tekrar kontrol et
          </Button>
        </section>
      </main>
    );
  }

  const panel = {
    overview: <OwnerOverviewPanel onOpenCouples={() => setActiveSection("couples")} />,
    couples: <OwnerCouplesPanel />,
    tokens: <OwnerTokensPanel />,
    audit: <OwnerAuditPanel />,
    cleanup: <OwnerCleanupPanel />,
    settings: (
      <OwnerSettingsPanel
        currentSessionId={sessionState.session.id}
        deviceLabel={sessionState.session.deviceLabel ?? "Bu cihaz"}
        onPasswordChanged={loadSession}
      />
    ),
    system: <OwnerSystemPanel />,
  }[activeSection];

  return (
    <main className="min-h-[100dvh] overflow-x-clip px-3 py-3 text-[var(--ink)] sm:px-5 sm:py-5 lg:px-7">
      <div className="mx-auto grid max-w-[96rem] gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100dvh-2.5rem)] rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.78)] p-4 backdrop-blur-xl lg:flex lg:flex-col">
          <BrandMark />
          <div className="mt-8 rounded-[24px] border border-[var(--line)] bg-white/45 p-4">
            <p className="eyebrow text-[var(--champagne-deep)]">Owner cockpit</p>
            <p className="mt-2 text-sm font-bold">{sessionState.session.deviceLabel ?? "Bu cihaz"}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">90 günlük yenilenen güvenli oturum</p>
          </div>
          <nav aria-label="Owner bölümleri" className="mt-5 grid gap-1.5">
            {sections.map((section) => {
              const Icon = section.icon;
              const active = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  aria-current={active ? "page" : undefined}
                  className={`focus-ring flex min-h-12 items-center gap-3 rounded-full px-4 text-left text-sm font-extrabold transition ${active ? "bg-[var(--ink)] text-[var(--paper-soft)]" : "text-[var(--ink-soft)] hover:bg-white/60 hover:text-[var(--ink)]"}`}
                >
                  <Icon className="size-4" />
                  {section.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto pt-5">
            <Button variant="quiet" fullWidth loading={loggingOut} onClick={() => void logout()}>
              <LogOut className="size-4" />
              Güvenli çıkış
            </Button>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="rounded-[30px] border border-white/75 bg-[rgba(255,250,243,0.82)] p-4 backdrop-blur-xl sm:p-5 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow text-[var(--champagne-deep)]">Owner cockpit</p>
                <h1 className="mt-1 font-display text-2xl font-semibold">Say Yes kontrol merkezi</h1>
              </div>
              <Button variant="quiet" loading={loggingOut} aria-label="Güvenli çıkış" className="px-4" onClick={() => void logout()}>
                <LogOut className="size-4" />
              </Button>
            </div>
            <nav aria-label="Owner bölümleri" className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sections.map((section) => {
                const Icon = section.icon;
                const active = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    aria-current={active ? "page" : undefined}
                    className={`focus-ring inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-extrabold transition ${active ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper-soft)]" : "border-[var(--line)] bg-white/55 text-[var(--ink-soft)]"}`}
                  >
                    <Icon className="size-4" />
                    {section.shortLabel}
                  </button>
                );
              })}
            </nav>
          </header>

          {logoutError ? (
            <p role="alert" className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-[var(--rosewood)]">
              Güvenli çıkış tamamlanamadı. Bağlantını kontrol edip tekrar dene.
            </p>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="mt-4 lg:mt-0"
            >
              {panel}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
      <footer className="mx-auto mt-4 flex max-w-[96rem] items-center justify-center gap-2 rounded-full border border-white/60 bg-white/35 px-4 py-2 text-center text-[11px] font-semibold text-[var(--ink-soft)] lg:ml-[17rem]">
        <HeartHandshake className="size-3.5" />
        Gerçek müşteri kayıtlarında test işlemi çalıştırılmaz.
      </footer>
    </main>
  );
}
