"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import {
  OwnerEmptyState,
  OwnerErrorState,
  OwnerLoading,
  OwnerPanelHeader,
} from "@/components/owner/OwnerPanelPrimitives";
import { formatOwnerDate, ownerApi } from "@/components/owner/utils";

type AuditItem = {
  id: string;
  actorSessionId: string | null;
  action: string;
  weddingId: string | null;
  wedding: { coupleName: string; slug: string } | null;
  operationKey: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "owner.setup_completed": "Owner kurulumu tamamlandı",
    "owner.signed_in": "Owner girişi yapıldı",
    "owner.signed_out": "Owner çıkışı yapıldı",
    "owner.session_revoked": "Bir cihaz oturumu kapatıldı",
    "owner.password_changed": "Owner şifresi değiştirildi",
    "token.issued": "Yeni Etsy tokenı üretildi",
    "token.rotated": "Etsy tokenı yenilendi",
    "token.revoked": "Etsy tokenı iptal edildi",
    "wedding.identity_updated": "Çift adı, tarihi veya adresi güncellendi",
    "entitlement.premium_extension_applied": "+50 GB / +6 ay uygulandı",
    "entitlement.event_reversed": "Paket hareketine kayıtlı düzeltme eklendi",
    "wedding.cleanup_approved": "Üyelik temizliği onaylandı",
    "wedding.cleanup_finalized": "Üyelik güvenle anonimleştirildi",
  };
  return labels[action] ?? action;
}

export function OwnerAuditPanel() {
  const [audit, setAudit] = useState<AuditItem[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const response = await ownerApi<{ audit: AuditItem[] }>("/api/owner/audit");
      setAudit(response.audit);
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
        eyebrow="Hareketler"
        title="Silinmeyen işlem günlüğü."
        body="Token, isim, tarih, paket, kota, cihaz ve temizlik işlemleri burada zaman sırasıyla görünür. Bir hata düzeltildiğinde eski kayıt silinmez; yeni düzeltme kaydı eklenir."
      />
      {error ? <OwnerErrorState retry={() => void load()} /> : null}
      {!audit && !error ? <OwnerLoading label="Hareketler yükleniyor" /> : null}
      {audit?.length === 0 ? <OwnerEmptyState title="Henüz hareket yok" body="Owner işlemleri başladığında kayıtlar burada görünecek." /> : null}
      {audit?.length ? (
        <section className="mt-4 overflow-hidden rounded-[28px] border border-white/75 bg-white/46">
          <ol className="divide-y divide-[var(--line)]">
            {audit.map((item) => (
              <li key={item.id} className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-white/65"><Activity className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="font-extrabold">{actionLabel(item.action)}</p><p className="mt-1 text-xs text-[var(--ink-soft)]">{item.wedding ? `${item.wedding.coupleName} · /${item.wedding.slug}` : "Owner hesabı"}</p></div>
                      <time className="shrink-0 text-xs font-bold text-[var(--ink-soft)]">{formatOwnerDate(item.createdAt, true)}</time>
                    </div>
                    {Object.keys(item.details ?? {}).length ? (
                      <details className="mt-3 rounded-[18px] border border-[var(--line)] bg-white/50 px-3 py-2.5 text-xs">
                        <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-full font-extrabold">Kayıt ayrıntısı<ChevronDown className="size-4" /></summary>
                        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-[14px] bg-[var(--paper)] p-3 font-mono text-[11px] leading-5">{JSON.stringify(item.details, null, 2)}</pre>
                      </details>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
