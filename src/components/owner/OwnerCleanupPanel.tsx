"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArchiveX, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import {
  OwnerEmptyState,
  OwnerErrorState,
  OwnerLoading,
  OwnerPanelHeader,
} from "@/components/owner/OwnerPanelPrimitives";
import type { OwnerWeddingSummary } from "@/components/owner/types";
import {
  createOperationKey,
  formatOwnerBytes,
  formatOwnerDate,
  ownerApi,
  ownerInputClass,
  ownerStatusLabel,
} from "@/components/owner/utils";

export function OwnerCleanupPanel() {
  const [weddings, setWeddings] = useState<OwnerWeddingSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<OwnerWeddingSummary | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState("");
  const operationKey = useRef<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(Boolean(selected));
  useAccessibleDialog({
    open: Boolean(selected),
    containerRef: dialogRef,
    initialFocusRef: closeRef,
    onClose: () => {
      if (!approving) setSelected(null);
    },
  });

  async function load() {
    setError(false);
    try {
      const response = await ownerApi<{ weddings: OwnerWeddingSummary[] }>("/api/owner/cleanup");
      setWeddings(response.weddings);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  function openApproval(wedding: OwnerWeddingSummary) {
    setSelected(wedding);
    setConfirmation("");
    setMessage("");
    operationKey.current = createOperationKey("owner-cleanup");
  }

  async function approve() {
    if (!selected || !operationKey.current) return;
    setApproving(true);
    setMessage("");
    try {
      const result = await ownerApi<{ jobs_queued: number; bytes_queued: number }>(
        `/api/owner/cleanup/${selected.id}/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            confirmation,
            operationKey: operationKey.current,
          }),
        },
      );
      operationKey.current = null;
      setMessage(
        `${result.jobs_queued} dosya (${formatOwnerBytes(result.bytes_queued)}) güvenli silme kuyruğuna alındı. R2 silinmeden üyelik anonimleştirilmeyecek.`,
      );
      setSelected(null);
      setConfirmation("");
      await load();
    } catch {
      setMessage("Temizlik onaylanamadı. Yazdığın adresi ve üyelik durumunu kontrol et.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div>
      <OwnerPanelHeader
        eyebrow="Temizlik"
        title="Silme kararı sende kalır."
        body="Erişim bittikten 30 gün sonra üyelik buraya düşer. Sistem kendiliğinden dosya silmez; önce önizleme ve tam adres onayı ister. Dosyalar R2’den silinmeden kişisel bilgiler anonimleştirilmez."
      />

      {message ? <p role="status" className="mt-4 rounded-[20px] border border-[var(--line)] bg-white/58 px-4 py-3 text-sm font-bold">{message}</p> : null}
      {error ? <OwnerErrorState retry={() => void load()} /> : null}
      {!weddings && !error ? <OwnerLoading label="Temizlik adayları yükleniyor" /> : null}
      {weddings?.length === 0 ? <OwnerEmptyState title="Temizlik bekleyen üyelik yok" body="30 günlük indirme süresi dolan hesaplar otomatik olarak burada görünecek." /> : null}

      {weddings?.length ? (
        <section className="mt-4 grid gap-3 lg:grid-cols-2">
          {weddings.map((wedding) => (
            <article key={wedding.id} className="rounded-[28px] border border-white/75 bg-white/48 p-5">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="eyebrow text-[var(--rosewood)]">{ownerStatusLabel(wedding.status)}</p><h3 className="mt-2 truncate font-display text-3xl font-semibold">{wedding.coupleName}</h3><p className="mt-1 truncate text-xs font-bold text-[var(--ink-soft)]">/{wedding.slug}</p></div><span className="grid size-11 shrink-0 place-items-center rounded-full border border-[rgba(124,58,49,0.18)] bg-white/58"><ArchiveX className="size-5 text-[var(--rosewood)]" /></span></div>
              <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-[18px] bg-white/58 p-3"><dt className="text-xs font-bold text-[var(--ink-soft)]">Erişim bitti</dt><dd className="mt-1 font-extrabold">{formatOwnerDate(wedding.accessExpiresAt, true)}</dd></div>
                <div className="rounded-[18px] bg-white/58 p-3"><dt className="text-xs font-bold text-[var(--ink-soft)]">Temizlik tarihi</dt><dd className="mt-1 font-extrabold">{formatOwnerDate(wedding.cleanupAfter, true)}</dd></div>
                <div className="rounded-[18px] bg-white/58 p-3"><dt className="text-xs font-bold text-[var(--ink-soft)]">Medya</dt><dd className="mt-1 font-extrabold">{wedding.mediaCount} dosya</dd></div>
                <div className="rounded-[18px] bg-white/58 p-3"><dt className="text-xs font-bold text-[var(--ink-soft)]">Kullanım</dt><dd className="mt-1 font-extrabold">{formatOwnerBytes(wedding.storageUsedBytes + wedding.systemStorageBytes)}</dd></div>
              </dl>
              {wedding.status === "active" ? (
                <Button variant="danger" fullWidth className="mt-4" onClick={() => openApproval(wedding)}><AlertTriangle className="size-4" />Önizle ve onayla</Button>
              ) : (
                <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/58 px-3 py-2 text-xs font-extrabold"><CheckCircle2 className="size-4" />R2 silme kuyruğu çalışıyor</p>
              )}
            </article>
          ))}
        </section>
      ) : null}

      {selected ? (
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="cleanup-confirm-title" tabIndex={-1} data-scroll-lock-allow="true" className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:place-items-center sm:p-6">
          <div className="modal-shell w-full max-w-xl rounded-[32px] border border-white/80 bg-[var(--paper-soft)] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.28)] sm:p-7">
            <div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-[var(--rosewood)]">Geri alınamaz onay</p><h3 id="cleanup-confirm-title" className="mt-2 font-display text-3xl font-semibold">{selected.coupleName}</h3></div><Button ref={closeRef} variant="quiet" aria-label="Temizlik penceresini kapat" className="px-4" onClick={() => setSelected(null)}><X className="size-4" /></Button></div>
            <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">Önce {selected.mediaCount} medya kaydı ve profil dosyası silme kuyruğuna girer. Bütün R2 işleri tamamlanınca tokenlar kapanır, eski linkler kaldırılır ve üyelik anonimleştirilir.</p>
            <label className="mt-5 grid gap-2 text-sm font-bold">Onay için <code className="rounded-full bg-white/65 px-2 py-1 font-mono text-xs">{selected.slug}</code> yaz<input className={ownerInputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required /></label>
            <Button variant="danger" fullWidth className="mt-4" loading={approving} disabled={confirmation !== selected.slug} onClick={() => void approve()}><ArchiveX className="size-4" />Güvenli temizlik kuyruğunu başlat</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
