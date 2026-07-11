"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Database,
  HardDrive,
  HeartHandshake,
  KeyRound,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/shared/Button";
import {
  OwnerErrorState,
  OwnerLoading,
  OwnerPanelHeader,
} from "@/components/owner/OwnerPanelPrimitives";
import { formatOwnerBytes, formatOwnerDate, ownerApi } from "@/components/owner/utils";

type Overview = {
  totalMemberships: number;
  activeMemberships: number;
  upcomingWeddings: number;
  expiredMemberships: number;
  cleanupCandidates: number;
  guestStorageBytes: number;
  systemStorageBytes: number;
  reservedStorageBytes: number;
  mediaCount: number;
  unusedTokens: number;
  latestHealth: null | {
    supabase_ok: boolean;
    r2_ok: boolean;
    checked_at: string;
  };
};

export function OwnerOverviewPanel({ onOpenCouples }: { onOpenCouples: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setData(await ownerApi<Overview>("/api/owner/overview"));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  return (
    <div>
      <OwnerPanelHeader
        eyebrow="Genel bakış"
        title="Sistemin tek bakışta durumu."
        body="Üyelik, düğün, depolama ve son sağlık kontrolü tek yerde. Buradaki rakamlar canlı veritabanından gelir."
        action={<Button onClick={onOpenCouples}><UsersRound className="size-4" />Çiftleri aç</Button>}
      />
      {error ? <OwnerErrorState retry={() => void load()} /> : null}
      {!data && !error ? <OwnerLoading /> : null}
      {data ? (
        <>
          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Toplam üyelik", value: data.totalMemberships, helper: `${data.activeMemberships} aktif`, icon: HeartHandshake },
              { label: "Yaklaşan düğün", value: data.upcomingWeddings, helper: "Bugün ve sonrası", icon: CalendarClock },
              { label: "Süresi biten", value: data.expiredMemberships, helper: `${data.cleanupCandidates} temizlik adayı`, icon: UsersRound },
              { label: "Kullanılmamış token", value: data.unusedTokens, helper: "Satışa hazır", icon: KeyRound },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="rounded-[28px] border border-white/75 bg-[var(--paper-soft)] p-5 shadow-[0_16px_42px_rgba(58,40,25,0.07)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--ink-soft)]">{metric.label}</p>
                    <span className="grid size-10 place-items-center rounded-full border border-[var(--line)] bg-white/62"><Icon className="size-4" /></span>
                  </div>
                  <p className="mt-5 font-display text-5xl font-semibold leading-none">{metric.value}</p>
                  <p className="mt-3 text-sm font-semibold text-[var(--ink-soft)]">{metric.helper}</p>
                </article>
              );
            })}
          </section>

          <section className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
            <article className="rounded-[28px] border border-white/75 bg-[rgba(255,250,243,0.76)] p-5 sm:p-6">
              <div className="flex items-center gap-3"><HardDrive className="size-5 text-[var(--champagne-deep)]" /><h3 className="font-display text-2xl font-semibold">Depolama görünümü</h3></div>
              <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] border border-[var(--line)] bg-white/52 p-4"><dt className="text-xs font-bold text-[var(--ink-soft)]">Misafir dosyaları</dt><dd className="mt-2 text-xl font-extrabold">{formatOwnerBytes(data.guestStorageBytes)}</dd></div>
                <div className="rounded-[22px] border border-[var(--line)] bg-white/52 p-4"><dt className="text-xs font-bold text-[var(--ink-soft)]">Sistem dosyaları</dt><dd className="mt-2 text-xl font-extrabold">{formatOwnerBytes(data.systemStorageBytes)}</dd></div>
                <div className="rounded-[22px] border border-[var(--line)] bg-white/52 p-4"><dt className="text-xs font-bold text-[var(--ink-soft)]">Ayrılmış yükleme</dt><dd className="mt-2 text-xl font-extrabold">{formatOwnerBytes(data.reservedStorageBytes)}</dd></div>
              </dl>
              <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink-soft)]"><Database className="size-4" />Toplam {data.mediaCount} medya kaydı</p>
            </article>

            <article className="rounded-[28px] border border-white/75 bg-[var(--ink)] p-5 text-[var(--paper-soft)] sm:p-6">
              <div className="flex items-center gap-3"><ShieldCheck className="size-5 text-[var(--champagne)]" /><h3 className="font-display text-2xl font-semibold">Sistem sağlığı</h3></div>
              {data.latestHealth ? (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-2 text-sm font-bold">
                    <span className="rounded-full bg-white/10 px-3 py-2">Supabase · {data.latestHealth.supabase_ok ? "İyi" : "Sorun"}</span>
                    <span className="rounded-full bg-white/10 px-3 py-2">R2 · {data.latestHealth.r2_ok ? "İyi" : "Sorun"}</span>
                  </div>
                  <p className="mt-4 text-xs text-white/65">Son kontrol: {formatOwnerDate(data.latestHealth.checked_at, true)}</p>
                </>
              ) : (
                <p className="mt-5 text-sm leading-6 text-white/70">Henüz günlük bağlantı kontrolü kaydı yok. Canlı geçişte cron görevi bunu dolduracak.</p>
              )}
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
