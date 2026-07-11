"use client";

import { useEffect, useState } from "react";
import { Cloud, Database, Gauge, ShieldCheck, ShieldX } from "lucide-react";
import {
  OwnerEmptyState,
  OwnerErrorState,
  OwnerLoading,
  OwnerPanelHeader,
} from "@/components/owner/OwnerPanelPrimitives";
import { formatOwnerDate, ownerApi } from "@/components/owner/utils";

type HealthCheck = {
  id: string;
  supabase_ok: boolean;
  r2_ok: boolean;
  supabase_latency_ms: number | null;
  r2_latency_ms: number | null;
  cleanup_candidate_count: number;
  details: Record<string, unknown>;
  checked_at: string;
};

export function OwnerSystemPanel() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const response = await ownerApi<{ checks: HealthCheck[] }>("/api/owner/system");
      setChecks(response.checks);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  const latest = checks?.[0];

  return (
    <div>
      <OwnerPanelHeader
        eyebrow="Sistem durumu"
        title="Supabase ve R2 gerçekten çalışıyor mu?"
        body="Günlük Vercel kontrolü iki servise gerçek bağlantı kurar, gecikmeyi ölçer ve sonucu burada saklar. Supabase Free planında kesintisizlik garantisi olmadığı için geçmiş kayıtlar özellikle önemlidir."
      />
      {error ? <OwnerErrorState retry={() => void load()} /> : null}
      {!checks && !error ? <OwnerLoading label="Sistem kayıtları yükleniyor" /> : null}
      {checks?.length === 0 ? <OwnerEmptyState title="Henüz sağlık kaydı yok" body="Canlı geçişte günlük kontrol görevi açıldığında ilk sonuç burada görünecek." /> : null}

      {latest ? (
        <>
          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Supabase", ok: latest.supabase_ok, latency: latest.supabase_latency_ms, icon: Database },
              { label: "Cloudflare R2", ok: latest.r2_ok, latency: latest.r2_latency_ms, icon: Cloud },
            ].map((service) => {
              const Icon = service.icon;
              return (
                <article key={service.label} className="rounded-[28px] border border-white/75 bg-white/48 p-5 sm:col-span-1 xl:col-span-2">
                  <div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-[var(--champagne-deep)]">Canlı bağlantı</p><h3 className="mt-2 font-display text-3xl font-semibold">{service.label}</h3></div><span className={`grid size-11 place-items-center rounded-full border ${service.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-[var(--rosewood)]"}`}><Icon className="size-5" /></span></div>
                  <div className="mt-5 flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold ${service.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-[var(--rosewood)]"}`}>{service.ok ? <ShieldCheck className="size-4" /> : <ShieldX className="size-4" />}{service.ok ? "Bağlantı iyi" : "Bağlantı sorunu"}</span><span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/60 px-3 py-2 text-xs font-extrabold"><Gauge className="size-4" />{service.latency === null ? "Ölçülmedi" : `${service.latency} ms`}</span></div>
                </article>
              );
            })}
          </section>

          <section className="mt-3 rounded-[28px] border border-white/75 bg-[var(--paper-soft)] p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow text-[var(--champagne-deep)]">Kontrol geçmişi</p><h3 className="mt-2 font-display text-2xl font-semibold">Son {checks.length} çalışma</h3></div><p className="text-xs font-bold text-[var(--ink-soft)]">Son kontrol: {formatOwnerDate(latest.checked_at, true)}</p></div>
            <div className="mt-5 overflow-x-auto rounded-[20px] border border-[var(--line)]">
              <table className="min-w-[44rem] w-full border-collapse text-left text-sm">
                <thead className="bg-white/60 text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]"><tr><th className="px-4 py-3">Tarih</th><th className="px-4 py-3">Supabase</th><th className="px-4 py-3">R2</th><th className="px-4 py-3">Temizlik adayı</th></tr></thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {checks.map((check) => (
                    <tr key={check.id}><td className="px-4 py-3 font-bold">{formatOwnerDate(check.checked_at, true)}</td><td className="px-4 py-3">{check.supabase_ok ? "İyi" : "Sorun"} · {check.supabase_latency_ms ?? "—"} ms</td><td className="px-4 py-3">{check.r2_ok ? "İyi" : "Sorun"} · {check.r2_latency_ms ?? "—"} ms</td><td className="px-4 py-3">{check.cleanup_candidate_count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
