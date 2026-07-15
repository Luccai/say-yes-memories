"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Crown,
  ExternalLink,
  History,
  Save,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/shared/Button";
import { CalendarDatePicker } from "@/components/shared/CalendarDatePicker";
import {
  OwnerEmptyState,
  OwnerErrorState,
  OwnerLoading,
  OwnerPanelHeader,
} from "@/components/owner/OwnerPanelPrimitives";
import type {
  OwnerWeddingDetail,
  OwnerWeddingSummary,
} from "@/components/owner/types";
import {
  createOperationKey,
  formatOwnerBytes,
  formatOwnerDate,
  ownerApi,
  ownerInputClass,
  ownerStatusLabel,
} from "@/components/owner/utils";
import { shouldShowOwnerProfile } from "@/components/owner/avatar-state";

type CoupleListResponse = { weddings: OwnerWeddingSummary[]; total: number };

function CoupleAvatar({ wedding }: { wedding: OwnerWeddingSummary }) {
  const source = `/api/owner/couples/${wedding.id}/profile?v=${encodeURIComponent(wedding.updatedAt)}`;
  const [failedSource, setFailedSource] = useState("");

  if (shouldShowOwnerProfile(wedding.hasProfile, source, failedSource)) {
    return (
      <Image
        src={source}
        alt=""
        width={64}
        height={80}
        unoptimized
        onError={() => setFailedSource(source)}
        className="h-16 w-13 rounded-[50%] border border-white/80 object-cover shadow-sm"
      />
    );
  }
  const initials = wedding.coupleName
    .split("&")
    .map((part) => part.trim().charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="grid h-16 w-13 shrink-0 place-items-center rounded-[50%] border border-[var(--line)] bg-white/65 font-display text-xl font-semibold">
      {initials || "SY"}
    </span>
  );
}

function EntitlementLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    activation: "Classic başlangıç",
    premium_extension: "+50 GB / +6 ay",
    event_date_change: "Tarih ve kimlik değişikliği",
    reversal: "Kayıtlı düzeltme",
    manual_adjustment: "Manuel ayarlama",
  };
  return labels[type] ?? type;
}

function CoupleDetail({
  detail,
  onClose,
  onRefresh,
}: {
  detail: OwnerWeddingDetail;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { wedding } = detail;
  const [brideName, setBrideName] = useState(wedding.brideName);
  const [groomName, setGroomName] = useState(wedding.groomName);
  const [eventDate, setEventDate] = useState(wedding.eventDate ?? "");
  const [timezone, setTimezone] = useState(wedding.timezone);
  const [identityNote, setIdentityNote] = useState("");
  const [extensionNote, setExtensionNote] = useState("");
  const [reversalEventId, setReversalEventId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [applyingExtension, setApplyingExtension] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const identityOperation = useRef<string | null>(null);
  const extensionOperation = useRef<string | null>(null);
  const reversalOperation = useRef<string | null>(null);

  async function updateIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!eventDate) {
      setError("Düğün tarihi seçilmeden kayıt yapılamaz.");
      return;
    }

    setSavingIdentity(true);
    setMessage("");
    setError("");
    identityOperation.current ??= createOperationKey("owner-identity");
    try {
      await ownerApi(`/api/owner/couples/${wedding.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          brideName,
          groomName,
          eventDate,
          timezone,
          note: identityNote,
          operationKey: identityOperation.current,
        }),
      });
      identityOperation.current = null;
      setIdentityNote("");
      setMessage("İsim, tarih ve yeni adres kaydedildi. Eski adresler yönlendirmeye devam ediyor.");
      await onRefresh();
    } catch {
      setError("Kimlik bilgileri kaydedilemedi. Alanları kontrol edip tekrar dene.");
    } finally {
      setSavingIdentity(false);
    }
  }

  async function applyExtension() {
    setApplyingExtension(true);
    setMessage("");
    setError("");
    extensionOperation.current ??= createOperationKey("owner-extension");
    try {
      await ownerApi(`/api/owner/couples/${wedding.id}/extensions`, {
        method: "POST",
        body: JSON.stringify({
          operationKey: extensionOperation.current,
          note: extensionNote,
        }),
      });
      extensionOperation.current = null;
      setExtensionNote("");
      setMessage("+50 GB ve +6 ay aynı hareket kaydında uygulandı.");
      await onRefresh();
    } catch {
      setError("Paket uygulanamadı. Aynı işlem tekrar gönderilmeyecek; önce kayıtları kontrol et.");
    } finally {
      setApplyingExtension(false);
    }
  }

  async function reverseEntitlement() {
    if (!reversalEventId) return;
    setReversing(true);
    setMessage("");
    setError("");
    reversalOperation.current ??= createOperationKey("owner-reversal");
    try {
      await ownerApi(`/api/owner/entitlements/${reversalEventId}/reverse`, {
        method: "POST",
        body: JSON.stringify({
          operationKey: reversalOperation.current,
          reason: reversalReason,
        }),
      });
      reversalOperation.current = null;
      setReversalEventId(null);
      setReversalReason("");
      setMessage("Düzeltme geçmiş silinmeden kaydedildi ve haklar yeniden hesaplandı.");
      await onRefresh();
    } catch {
      setError("Düzeltme kaydedilemedi. Bu hareket daha önce düzeltilmiş olabilir.");
    } finally {
      setReversing(false);
    }
  }

  const usagePercent = Math.min(
    100,
    wedding.storageQuotaBytes
      ? (wedding.storageUsedBytes / wedding.storageQuotaBytes) * 100
      : 0,
  );

  return (
    <section className="mt-4 scroll-mt-4 rounded-[32px] border border-white/80 bg-[rgba(255,250,243,0.86)] p-4 shadow-[0_24px_80px_rgba(58,40,25,0.12)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <CoupleAvatar wedding={wedding} />
          <div className="min-w-0">
            <p className="eyebrow text-[var(--champagne-deep)]">Çift detayı</p>
            <h3 className="mt-1 truncate font-display text-3xl font-semibold">{wedding.coupleName}</h3>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--ink-soft)]">/{wedding.slug}</p>
          </div>
        </div>
        <Button variant="quiet" aria-label="Detayı kapat" className="px-4" onClick={onClose}><X className="size-4" /></Button>
      </div>

      {message ? <p role="status" className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">{message}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-[var(--rosewood)]">{error}</p> : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <article className="rounded-[26px] border border-[var(--line)] bg-white/46 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="eyebrow text-[var(--champagne-deep)]">Üyelik</p><h4 className="mt-1 font-display text-2xl font-semibold">Kota ve erişim</h4></div>
            <span className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-2 text-xs font-extrabold">{ownerStatusLabel(wedding.status)}</span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] bg-white/58 p-4"><dt className="text-xs font-bold text-[var(--ink-soft)]">Açılış tarihi</dt><dd className="mt-2 font-extrabold">{formatOwnerDate(wedding.activatedAt ?? wedding.createdAt, true)}</dd></div>
            <div className="rounded-[20px] bg-white/58 p-4"><dt className="text-xs font-bold text-[var(--ink-soft)]">Erişim bitişi</dt><dd className="mt-2 font-extrabold">{formatOwnerDate(wedding.accessExpiresAt, true)}</dd></div>
            <div className="rounded-[20px] bg-white/58 p-4"><dt className="text-xs font-bold text-[var(--ink-soft)]">Medya</dt><dd className="mt-2 font-extrabold">{wedding.mediaCount} kayıt</dd></div>
            <div className="rounded-[20px] bg-white/58 p-4"><dt className="text-xs font-bold text-[var(--ink-soft)]">Eski uyumluluk kodu</dt><dd className="mt-2 truncate font-mono text-sm font-extrabold">{wedding.studioCode}</dd></div>
          </dl>
          <div className="mt-3 rounded-[20px] bg-white/58 p-4">
            <div className="flex items-center justify-between gap-3 text-sm font-bold"><span>{formatOwnerBytes(wedding.storageUsedBytes)} kullanıldı</span><span>{formatOwnerBytes(wedding.storageQuotaBytes)}</span></div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--paper)]"><div className="h-full rounded-full bg-[var(--champagne-deep)]" style={{ width: `${usagePercent}%` }} /></div>
            <p className="mt-2 text-xs text-[var(--ink-soft)]">Ayrılmış: {formatOwnerBytes(wedding.reservedStorageBytes)} · Sistem: {formatOwnerBytes(wedding.systemStorageBytes)}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/${wedding.slug}`} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--line)] bg-white/60 px-4 text-sm font-extrabold"><ExternalLink className="size-4" />Misafir sayfası</a>
          </div>
        </article>

        <article className="rounded-[26px] border border-[var(--line)] bg-white/46 p-4 sm:p-5">
          <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]"><Crown className="size-4" />Yeni satış</p>
          <h4 className="mt-2 font-display text-2xl font-semibold">Premium Extension</h4>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">Tam olarak +50 GB ve +6 ay ekler. Müşteri Etsy’de yalnızca çift adını yazar; burada doğru üyeliği seçmen yeterli.</p>
          <label className="mt-5 grid gap-2 text-sm font-bold">İşlem notu<input className={ownerInputClass} value={extensionNote} onChange={(event) => setExtensionNote(event.target.value)} maxLength={500} placeholder="Örn. Etsy mesajı 11 Temmuz" /></label>
          <Button fullWidth className="mt-4" loading={applyingExtension} onClick={() => void applyExtension()}><Crown className="size-4" />+50 GB / +6 ay tanımla</Button>
          <p className="mt-3 text-xs leading-5 text-[var(--ink-soft)]">Buton aynı işlem sırasında tekrar tıklansa bile tek hareket anahtarı kullanır.</p>
        </article>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={updateIdentity} className="rounded-[26px] border border-[var(--line)] bg-white/46 p-4 sm:p-5">
          <p className="eyebrow text-[var(--champagne-deep)]">Owner düzenlemesi</p>
          <h4 className="mt-2 font-display text-2xl font-semibold">İsim, tarih ve adres</h4>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">İsim değişirse yeni adres oluşur; eski QR ve linkler yeni adrese yönlenir. Ücretli aylar yeniden hesaplanırken kaybolmaz.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">Birinci isim<input className={ownerInputClass} value={brideName} onChange={(event) => setBrideName(event.target.value)} maxLength={80} required /></label>
            <label className="grid gap-2 text-sm font-bold">İkinci isim<input className={ownerInputClass} value={groomName} onChange={(event) => setGroomName(event.target.value)} maxLength={80} required /></label>
            <div className="grid gap-2 text-sm font-bold">
              <span>Düğün tarihi</span>
              <CalendarDatePicker
                label="Düğün tarihi"
                locale="tr"
                startMonth={new Date(1980, 6)}
                endMonth={new Date(2100, 11)}
                required
                value={eventDate}
                onChange={setEventDate}
              />
            </div>
            <label className="grid gap-2 text-sm font-bold">Saat dilimi<input className={ownerInputClass} value={timezone} onChange={(event) => setTimezone(event.target.value)} required /></label>
          </div>
          <label className="mt-3 grid gap-2 text-sm font-bold">Değişiklik nedeni<input className={ownerInputClass} value={identityNote} onChange={(event) => setIdentityNote(event.target.value)} maxLength={500} placeholder="Örn. Müşteri Etsy’den doğruladı" /></label>
          <Button type="submit" fullWidth className="mt-4" loading={savingIdentity}><Save className="size-4" />Güvenle kaydet</Button>

          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--ink-soft)]">Adres geçmişi</p>
            <div className="mt-3 grid gap-2">
              {detail.slugs.map((item) => (
                <div key={item.slug} className="flex items-center justify-between gap-3 rounded-[18px] bg-white/58 px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-mono font-bold">/{item.slug}</span>
                  <span className="shrink-0 rounded-full border border-[var(--line)] px-2 py-1 text-[10px] font-extrabold uppercase">{item.is_canonical ? "Güncel" : "Yönlenir"}</span>
                </div>
              ))}
            </div>
          </div>
        </form>

        <article className="rounded-[26px] border border-[var(--line)] bg-white/46 p-4 sm:p-5">
          <div className="flex items-center gap-3"><History className="size-5 text-[var(--champagne-deep)]" /><div><p className="eyebrow text-[var(--champagne-deep)]">Değişmez defter</p><h4 className="mt-1 font-display text-2xl font-semibold">Paket ve süre geçmişi</h4></div></div>
          <div className="mt-5 grid gap-2">
            {detail.entitlements.map((event) => {
              const reversible = event.event_type === "premium_extension" || event.event_type === "manual_adjustment";
              const alreadyReversed = detail.entitlements.some((candidate) => candidate.reverses_event_id === event.id);
              return (
                <div key={event.id} className="rounded-[20px] border border-[var(--line)] bg-white/58 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-extrabold"><EntitlementLabel type={event.event_type} /></p><p className="mt-1 text-xs text-[var(--ink-soft)]">{formatOwnerDate(event.applied_at, true)}</p></div>
                    <div className="flex gap-2 text-xs font-extrabold"><span className="rounded-full bg-[var(--paper)] px-2.5 py-1.5">{event.quota_delta_bytes >= 0 ? "+" : ""}{formatOwnerBytes(Math.abs(event.quota_delta_bytes))}</span><span className="rounded-full bg-[var(--paper)] px-2.5 py-1.5">{event.access_delta_months >= 0 ? "+" : ""}{event.access_delta_months} ay</span></div>
                  </div>
                  {event.note ? <p className="mt-3 text-sm text-[var(--ink-soft)]">{event.note}</p> : null}
                  {reversible && !alreadyReversed ? <Button variant="danger" className="mt-3 min-h-11 px-4" onClick={() => { setReversalEventId(event.id); setReversalReason(""); }}><Undo2 className="size-4" />Kayıtlı düzeltme</Button> : null}
                  {alreadyReversed ? <p className="mt-3 text-xs font-bold text-[var(--rosewood)]">Bu hareket düzeltildi; geçmiş korunuyor.</p> : null}
                </div>
              );
            })}
          </div>
          {detail.entitlements.length === 0 ? <p className="mt-4 text-sm text-[var(--ink-soft)]">Henüz hareket kaydı yok.</p> : null}
        </article>
      </div>

      {reversalEventId ? (
        <div className="mt-4 rounded-[26px] border border-[rgba(124,58,49,0.2)] bg-[rgba(124,58,49,0.06)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-[var(--rosewood)]">Düzeltme işlemi</p><h4 className="mt-2 font-display text-2xl font-semibold">Geçmiş silinmeyecek.</h4></div><Button variant="quiet" aria-label="Düzeltmeyi kapat" className="px-4" onClick={() => setReversalEventId(null)}><X className="size-4" /></Button></div>
          <label className="mt-4 grid gap-2 text-sm font-bold">Zorunlu düzeltme nedeni<textarea className={`${ownerInputClass} min-h-28 resize-y`} value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} maxLength={500} required /></label>
          <Button variant="danger" className="mt-4" loading={reversing} disabled={reversalReason.trim().length < 3} onClick={() => void reverseEntitlement()}><Undo2 className="size-4" />Düzeltmeyi kaydet</Button>
        </div>
      ) : null}
    </section>
  );
}

export function OwnerCouplesPanel() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [data, setData] = useState<CoupleListResponse | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OwnerWeddingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRef = useRef<HTMLElement | null>(null);

  const loadList = useCallback(async (query: string) => {
    setError(false);
    try {
      setData(await ownerApi<CoupleListResponse>(`/api/owner/couples?q=${encodeURIComponent(query)}`));
    } catch {
      setError(true);
    }
  }, []);

  async function loadDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      setDetail(await ownerApi<OwnerWeddingDetail>(`/api/owner/couples/${id}`));
      requestAnimationFrame(() => {
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        detailRef.current?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadList(""));
  }, [loadList]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    setSubmittedSearch(query);
    setSelectedId(null);
    setDetail(null);
    void loadList(query);
  }

  return (
    <div>
      <OwnerPanelHeader eyebrow="Çiftler" title="Her üyeliğin canlı dosyası." body="Aynı isimli çiftleri adres ve açılış tarihiyle ayırt et; kota, süre, medya ve bütün hareket geçmişini tek yerden yönet." />
      <form onSubmit={submitSearch} className="mt-4 grid gap-2 rounded-[26px] border border-white/75 bg-white/48 p-3 sm:grid-cols-[1fr_auto] sm:p-4">
        <label className="sr-only" htmlFor="owner-couple-search">Çift adı veya adres ara</label>
        <input id="owner-couple-search" className={ownerInputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Örn. Fatma & Mihail veya fatma-mihail-2" />
        <Button type="submit"><Search className="size-4" />Ara</Button>
      </form>

      {error ? <OwnerErrorState retry={() => void loadList(submittedSearch)} /> : null}
      {!data && !error ? <OwnerLoading label="Çiftler yükleniyor" /> : null}
      {data?.weddings.length === 0 ? <OwnerEmptyState title="Eşleşen üyelik yok" body="İsmi ya da sayfa adresini kontrol ederek tekrar ara." /> : null}
      {data?.weddings.length ? (
        <section className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {data.weddings.map((wedding) => (
            <button key={wedding.id} type="button" onClick={() => void loadDetail(wedding.id)} className={`focus-ring group min-h-44 rounded-[28px] border p-5 text-left transition motion-safe:hover:-translate-y-0.5 ${selectedId === wedding.id ? "border-[var(--champagne-deep)] bg-[var(--paper-soft)] shadow-[0_18px_50px_rgba(58,40,25,0.12)]" : "border-white/75 bg-white/48 hover:bg-white/68"}`}>
              <div className="flex items-start gap-4"><CoupleAvatar wedding={wedding} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate font-display text-2xl font-semibold">{wedding.coupleName}</h3><p className="mt-1 truncate text-xs font-bold text-[var(--ink-soft)]">/{wedding.slug}</p></div><ChevronRight className="mt-2 size-4 shrink-0 transition group-hover:translate-x-0.5" /></div><div className="mt-4 flex flex-wrap gap-2 text-[11px] font-extrabold"><span className="rounded-full border border-[var(--line)] bg-white/60 px-2.5 py-1.5">{ownerStatusLabel(wedding.status)}</span><span className="rounded-full border border-[var(--line)] bg-white/60 px-2.5 py-1.5">{wedding.mediaCount} medya</span></div></div></div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[var(--ink-soft)]"><p className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />{formatOwnerDate(wedding.eventDate)}</p><p className="inline-flex items-center justify-end gap-1.5"><Clock3 className="size-3.5" />{formatOwnerDate(wedding.activatedAt ?? wedding.createdAt)}</p></div>
            </button>
          ))}
        </section>
      ) : null}

      {detailLoading ? <div className="mt-4"><OwnerLoading label="Çift detayı yükleniyor" /></div> : null}
      {detail && !detailLoading ? (
        <div ref={(node) => { detailRef.current = node; }}>
          <CoupleDetail key={detail.wedding.updatedAt} detail={detail} onClose={() => { setSelectedId(null); setDetail(null); }} onRefresh={async () => { await Promise.all([loadDetail(detail.wedding.id), loadList(submittedSearch)]); }} />
        </div>
      ) : null}
    </div>
  );
}
