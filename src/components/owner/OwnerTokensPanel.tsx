"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, RefreshCw, ShieldX, X } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import {
  OwnerEmptyState,
  OwnerErrorState,
  OwnerLoading,
  OwnerPanelHeader,
} from "@/components/owner/OwnerPanelPrimitives";
import {
  createOperationKey,
  formatOwnerDate,
  ownerApi,
  ownerInputClass,
  ownerStatusLabel,
} from "@/components/owner/utils";

type TokenItem = {
  id: string;
  status: string;
  label: string | null;
  weddingId: string | null;
  wedding: { coupleName: string; slug: string } | null;
  createdAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
  rotatedFromId: string | null;
};

type TokenResponse = { tokens: TokenItem[]; total: number };
type RevealedToken = {
  id: string;
  rawToken: string;
  label: string | null;
  status: string;
  weddingId?: string | null;
  createdAt: string;
};

export function OwnerTokensPanel() {
  const [data, setData] = useState<TokenResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(false);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<RevealedToken | null>(null);
  const revealedDialogRef = useRef<HTMLElement>(null);
  const revealedCloseRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [actionToken, setActionToken] = useState<TokenItem | null>(null);
  const [action, setAction] = useState<"rotate" | "revoke" | null>(null);
  const [actionLabel, setActionLabel] = useState("");
  const [reason, setReason] = useState("");
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState("");
  const createKey = useRef<string | null>(null);
  const actionKey = useRef<string | null>(null);

  useBodyScrollLock(Boolean(revealed));
  useAccessibleDialog({
    open: Boolean(revealed),
    containerRef: revealedDialogRef,
    initialFocusRef: revealedCloseRef,
    onClose: () => setRevealed(null),
  });

  const load = useCallback(async (nextOffset: number) => {
    setError(false);
    try {
      setData(await ownerApi<TokenResponse>(`/api/owner/tokens?limit=100&offset=${nextOffset}`));
      setOffset(nextOffset);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load(0));
  }, [load]);

  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setMessage("");
    createKey.current ??= createOperationKey("owner-token-issue");
    try {
      const response = await ownerApi<{ token: RevealedToken }>("/api/owner/tokens", {
        method: "POST",
        body: JSON.stringify({ label, operationKey: createKey.current }),
      });
      createKey.current = null;
      setRevealed(response.token);
      setLabel("");
      setCopied(false);
      await load(0);
    } catch (caught) {
      setMessage(
        caught instanceof Error && caught.message === "TOKEN_ALREADY_CREATED"
          ? "Bu istek daha önce işlendi; güvenlik gereği token tekrar gösterilemez. Listedeki kaydı yenileyebilirsin."
          : "Token üretilemedi. Tekrar denemeden önce listeyi yenile.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyToken() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed.rawToken);
    setCopied(true);
  }

  function openAction(token: TokenItem, nextAction: "rotate" | "revoke") {
    setActionToken(token);
    setAction(nextAction);
    setActionLabel(token.label ? `${token.label} yenilendi` : "Yenilenen Etsy tokenı");
    setReason("");
    setMessage("");
    actionKey.current = createOperationKey(`owner-token-${nextAction}`);
  }

  async function submitAction() {
    if (!actionToken || !action || !actionKey.current) return;
    setActing(true);
    setMessage("");
    try {
      if (action === "rotate") {
        const response = await ownerApi<{ token: RevealedToken }>(
          `/api/owner/tokens/${actionToken.id}/rotate`,
          {
            method: "POST",
            body: JSON.stringify({ label: actionLabel, operationKey: actionKey.current }),
          },
        );
        setRevealed(response.token);
        setCopied(false);
      } else {
        await ownerApi(`/api/owner/tokens/${actionToken.id}/revoke`, {
          method: "POST",
          body: JSON.stringify({ reason, operationKey: actionKey.current }),
        });
        setMessage("Token iptal edildi. Geçmiş kaydı korunuyor.");
      }
      actionKey.current = null;
      setAction(null);
      setActionToken(null);
      await load(offset);
    } catch {
      setMessage("İşlem tamamlanamadı. Token geçmişini kontrol edip yeniden dene.");
    } finally {
      setActing(false);
    }
  }

  return (
    <div>
      <OwnerPanelHeader
        eyebrow="Tokenlar"
        title="Satış anahtarlarını güvenle yönet."
        body="Yeni token yalnızca üretildiği anda görünür; veritabanında ham değer tutulmaz. Aktif token yenilenirse eski token iptal edilir ve aynı üyelik yeni tokena bağlanır."
      />

      <form onSubmit={createToken} className="mt-4 grid gap-3 rounded-[28px] border border-white/75 bg-white/48 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-bold">
          Token etiketi
          <input className={ownerInputClass} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="Örn. Etsy Temmuz satışı" required />
        </label>
        <Button type="submit" loading={creating}><KeyRound className="size-4" />Yeni token üret</Button>
      </form>

      {message ? <p role="status" className="mt-3 rounded-[18px] border border-[var(--line)] bg-white/52 px-4 py-3 text-sm font-bold">{message}</p> : null}
      {error ? <OwnerErrorState retry={() => void load(offset)} /> : null}
      {!data && !error ? <OwnerLoading label="Tokenlar yükleniyor" /> : null}
      {data?.tokens.length === 0 ? <OwnerEmptyState title="Token yok" body="İlk Etsy satışı için yukarıdan yeni token üretebilirsin." /> : null}

      {data?.tokens.length ? (
        <section className="mt-4 overflow-hidden rounded-[28px] border border-white/75 bg-white/46">
          <div className="divide-y divide-[var(--line)]">
            {data.tokens.map((token) => (
              <article key={token.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-extrabold">{token.label || "Etiketsiz token"}</p>
                    <span className="rounded-full border border-[var(--line)] bg-white/62 px-2.5 py-1 text-[10px] font-extrabold uppercase">{ownerStatusLabel(token.status)}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] font-bold text-[var(--ink-soft)]">{token.id}</p>
                  <p className="mt-2 text-xs text-[var(--ink-soft)]">
                    {token.wedding ? `${token.wedding.coupleName} · /${token.wedding.slug}` : "Henüz üyeliğe bağlanmadı"} · {formatOwnerDate(token.createdAt, true)}
                  </p>
                </div>
                {token.status !== "revoked" ? (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button variant="paper" className="min-h-11 px-4" onClick={() => openAction(token, "rotate")}><RefreshCw className="size-4" />Yenile</Button>
                    <Button variant="danger" className="min-h-11 px-4" onClick={() => openAction(token, "revoke")}><ShieldX className="size-4" />İptal</Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] p-3 text-xs font-bold text-[var(--ink-soft)]">
            <Button variant="quiet" className="min-h-11 px-4" disabled={offset === 0} onClick={() => void load(Math.max(0, offset - 100))}>Önceki</Button>
            <span>{offset + 1}–{Math.min(offset + data.tokens.length, data.total)} / {data.total}</span>
            <Button variant="quiet" className="min-h-11 px-4" disabled={offset + data.tokens.length >= data.total} onClick={() => void load(offset + 100)}>Sonraki</Button>
          </div>
        </section>
      ) : null}

      {action && actionToken ? (
        <section className="mt-4 rounded-[28px] border border-[var(--line)] bg-[var(--paper-soft)] p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-[var(--champagne-deep)]">{action === "rotate" ? "Token yenileme" : "Token iptali"}</p><h3 className="mt-2 font-display text-2xl font-semibold">{actionToken.label || actionToken.id}</h3></div><Button variant="quiet" aria-label="İşlemi kapat" className="px-4" onClick={() => { setAction(null); setActionToken(null); }}><X className="size-4" /></Button></div>
          {action === "rotate" ? (
            <label className="mt-4 grid gap-2 text-sm font-bold">Yeni token etiketi<input className={ownerInputClass} value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} maxLength={80} required /></label>
          ) : (
            <label className="mt-4 grid gap-2 text-sm font-bold">Zorunlu iptal nedeni<textarea className={`${ownerInputClass} min-h-28 resize-y`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required /></label>
          )}
          {actionToken.status === "active" ? <p className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">Bu token aktif bir üyeliğe bağlı. Yenilersen yeni token aynı üyeliğe bağlanır; yalnızca iptal edersen müşteri yeni cihaz girişi ve şifre yenileme yapamaz.</p> : null}
          <Button variant={action === "revoke" ? "danger" : "ink"} className="mt-4" loading={acting} disabled={action === "rotate" ? actionLabel.trim().length < 1 : reason.trim().length < 3} onClick={() => void submitAction()}>{action === "rotate" ? <RefreshCw className="size-4" /> : <ShieldX className="size-4" />}{action === "rotate" ? "Yeni tokenı üret" : "Tokenı iptal et"}</Button>
        </section>
      ) : null}

      {revealed ? (
        <section ref={revealedDialogRef} role="dialog" aria-modal="true" aria-labelledby="revealed-token-title" tabIndex={-1} className="fixed inset-0 z-50 grid place-items-end overflow-y-auto bg-black/35 p-3 backdrop-blur-sm sm:place-items-center sm:p-6">
          <div className="modal-shell w-full max-w-lg rounded-[32px] border border-white/80 bg-[var(--paper-soft)] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.26)] sm:p-7">
            <div className="flex items-start justify-between gap-3"><div><p className="eyebrow text-[var(--champagne-deep)]">Yalnızca bir kez gösterilir</p><h3 id="revealed-token-title" className="mt-2 font-display text-3xl font-semibold">Tokenı şimdi kopyala.</h3></div><Button ref={revealedCloseRef} variant="quiet" aria-label="Token penceresini kapat" className="px-4" onClick={() => setRevealed(null)}><X className="size-4" /></Button></div>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">Bu pencere kapandıktan sonra ham token geri getirilemez; gerekirse listedeki kaydı güvenle yenile.</p>
            <code className="mt-5 block break-all rounded-[22px] border border-[var(--line)] bg-white/70 p-4 text-center text-base font-extrabold tracking-[0.08em]">{revealed.rawToken}</code>
            <Button fullWidth className="mt-4" onClick={() => void copyToken()}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Kopyalandı" : "Tokenı kopyala"}</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
