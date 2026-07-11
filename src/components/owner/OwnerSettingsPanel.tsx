"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { KeyRound, Laptop, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/shared/Button";
import {
  OwnerErrorState,
  OwnerLoading,
  OwnerPanelHeader,
} from "@/components/owner/OwnerPanelPrimitives";
import {
  createOperationKey,
  formatOwnerDate,
  ownerApi,
  ownerInputClass,
} from "@/components/owner/utils";

type DeviceSession = {
  id: string;
  password_version: number;
  device_label: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export function OwnerSettingsPanel({
  currentSessionId,
  deviceLabel,
  onPasswordChanged,
}: {
  currentSessionId: string;
  deviceLabel: string;
  onPasswordChanged: () => Promise<void>;
}) {
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [nextDeviceLabel, setNextDeviceLabel] = useState(deviceLabel);
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState("");
  const passwordOperation = useRef<string | null>(null);

  async function load() {
    setError(false);
    try {
      const response = await ownerApi<{ sessions: DeviceSession[] }>("/api/owner/settings/sessions");
      setSessions(response.sessions);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  async function revoke(sessionId: string) {
    setRevokingId(sessionId);
    setMessage("");
    try {
      await ownerApi(`/api/owner/settings/sessions/${sessionId}/revoke`, {
        method: "POST",
        body: JSON.stringify({ operationKey: createOperationKey("owner-session-revoke") }),
      });
      setMessage("Cihaz oturumu kapatıldı.");
      await load();
    } catch {
      setMessage("Cihaz oturumu kapatılamadı.");
    } finally {
      setRevokingId(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChanging(true);
    setMessage("");
    passwordOperation.current ??= createOperationKey("owner-password-change");
    try {
      await ownerApi("/api/owner/settings/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          password,
          passwordConfirm,
          deviceLabel: nextDeviceLabel,
          operationKey: passwordOperation.current,
        }),
      });
      passwordOperation.current = null;
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirm("");
      setMessage("Owner şifresi değişti. Diğer bütün cihaz oturumları kapatıldı.");
      await onPasswordChanged();
      await load();
    } catch (caught) {
      setMessage(
        caught instanceof Error && caught.message === "INVALID_CURRENT_PASSWORD"
          ? "Mevcut owner şifresi yanlış."
          : "Şifre değiştirilemedi. Yeni şifrelerin eşleştiğini kontrol et.",
      );
    } finally {
      setChanging(false);
    }
  }

  const activeSessions = sessions?.filter((session) => !session.revoked_at) ?? [];

  return (
    <div>
      <OwnerPanelHeader
        eyebrow="Ayarlar"
        title="Owner erişimini sen kontrol et."
        body="Açık cihazları gör, tek tek kapat ve owner şifresini değiştir. Şifre değiştiğinde mevcut cihaz için yeni oturum açılır; diğer bütün cihazlar kapanır."
      />
      {message ? <p role="status" className="mt-4 rounded-[20px] border border-[var(--line)] bg-white/58 px-4 py-3 text-sm font-bold">{message}</p> : null}
      {error ? <OwnerErrorState retry={() => void load()} /> : null}
      {!sessions && !error ? <OwnerLoading label="Owner cihazları yükleniyor" /> : null}

      {sessions ? (
        <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <article className="rounded-[28px] border border-white/75 bg-white/48 p-5 sm:p-6">
            <div className="flex items-center gap-3"><Laptop className="size-5 text-[var(--champagne-deep)]" /><div><p className="eyebrow text-[var(--champagne-deep)]">Açık cihazlar</p><h3 className="mt-1 font-display text-2xl font-semibold">{activeSessions.length} aktif oturum</h3></div></div>
            <div className="mt-5 grid gap-2">
              {activeSessions.map((session) => {
                const current = session.id === currentSessionId;
                return (
                  <div key={session.id} className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-white/58 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-extrabold">{session.device_label || "Adsız cihaz"}</p>{current ? <span className="rounded-full bg-[var(--ink)] px-2.5 py-1 text-[10px] font-extrabold uppercase text-[var(--paper-soft)]">Bu cihaz</span> : null}</div><p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">Son kullanım: {formatOwnerDate(session.last_seen_at, true)}<br />Oturum bitişi: {formatOwnerDate(session.expires_at, true)}</p></div>
                    {current ? <span className="inline-flex items-center gap-2 text-xs font-bold text-[var(--ink-soft)]"><ShieldCheck className="size-4" />Güvenli</span> : <Button variant="danger" className="min-h-11 px-4" loading={revokingId === session.id} onClick={() => void revoke(session.id)}><LogOut className="size-4" />Kapat</Button>}
                  </div>
                );
              })}
            </div>
          </article>

          <form onSubmit={changePassword} className="rounded-[28px] border border-white/75 bg-[var(--paper-soft)] p-5 sm:p-6">
            <div className="flex items-center gap-3"><KeyRound className="size-5 text-[var(--champagne-deep)]" /><div><p className="eyebrow text-[var(--champagne-deep)]">Güvenlik</p><h3 className="mt-1 font-display text-2xl font-semibold">Owner şifresini değiştir</h3></div></div>
            <div className="mt-5 grid gap-3">
              <label className="grid gap-2 text-sm font-bold">Mevcut şifre<input className={ownerInputClass} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" minLength={12} maxLength={256} required /></label>
              <label className="grid gap-2 text-sm font-bold">Yeni şifre<input className={ownerInputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={256} required /></label>
              <label className="grid gap-2 text-sm font-bold">Yeni şifre tekrar<input className={ownerInputClass} type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={12} maxLength={256} required /></label>
              <label className="grid gap-2 text-sm font-bold">Bu cihazın adı<input className={ownerInputClass} value={nextDeviceLabel} onChange={(event) => setNextDeviceLabel(event.target.value)} maxLength={80} required /></label>
            </div>
            <Button type="submit" fullWidth className="mt-4" loading={changing}><KeyRound className="size-4" />Şifreyi değiştir ve diğer cihazları kapat</Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
