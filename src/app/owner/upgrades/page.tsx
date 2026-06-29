import { Crown, LogOut, Search } from "lucide-react";
import {
  isOwnerAuthenticated,
  isOwnerPasswordConfigured,
} from "@/lib/owner-auth";
import {
  getWeddingByStudioCode,
  listUpgradeLogs,
} from "@/lib/supabase-store";
import {
  formatStorageBytes,
  storageUsagePercent,
} from "@/lib/storage/quota";

type OwnerUpgradesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value?: string) {
  if (!value) {
    return "Ayarlanmamış";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function OwnerLogin({
  configured,
  error,
}: {
  configured: boolean;
  error?: string;
}) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10 text-[var(--ink)]">
      <form
        method="post"
        action="/api/owner/login"
        className="w-full max-w-md rounded-[30px] border border-white/75 bg-[rgba(255,250,243,0.86)] p-6 shadow-[0_22px_70px_rgba(58,40,25,0.14)]"
      >
        <p className="eyebrow text-[var(--champagne-deep)]">Owner</p>
        <h1 className="mt-3 font-display text-3xl font-semibold">Upgrade Yönetimi</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
          Manuel Etsy Premium Extension tanımlamak için owner şifresiyle giriş yap.
        </p>
        {error ? (
          <p className="mt-4 rounded-[18px] border border-[rgba(124,58,49,0.2)] bg-[rgba(124,58,49,0.08)] p-3 text-sm font-bold text-[var(--rosewood)]">
            {error}
          </p>
        ) : null}
        <label className="mt-5 grid gap-2 text-sm font-bold">
          Owner şifresi
          <input
            name="password"
            type="password"
            disabled={!configured}
            className="focus-ring rounded-[18px] border border-[var(--line)] bg-white/70 px-4 py-3 text-base"
            required
          />
        </label>
        <button
          type="submit"
          disabled={!configured}
          className="focus-ring mt-5 inline-flex w-full items-center justify-center rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-bold text-[var(--paper-soft)]"
        >
          Owner panelini aç
        </button>
      </form>
    </main>
  );
}

export default async function OwnerUpgradesPage({ searchParams }: OwnerUpgradesPageProps) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const applied = firstParam(params.applied);
  const studioCode = firstParam(params.studioCode)?.trim().toUpperCase() ?? "";
  const ownerPasswordConfigured = isOwnerPasswordConfigured();
  const authenticated = await isOwnerAuthenticated();

  if (!authenticated) {
    return (
      <OwnerLogin
        configured={ownerPasswordConfigured}
        error={error ?? (ownerPasswordConfigured ? undefined : "Owner şifresi ayarlı değil.")}
      />
    );
  }

  const wedding = studioCode ? await getWeddingByStudioCode(studioCode) : null;
  const logs = wedding ? await listUpgradeLogs(wedding.id) : [];
  const percent = wedding ? storageUsagePercent(wedding.storageUsedBytes, wedding.storageQuotaBytes) : 0;

  return (
    <main className="min-h-[100dvh] px-4 py-6 text-[var(--ink)] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[30px] border border-white/75 bg-[rgba(255,250,243,0.82)] p-5 shadow-[0_18px_54px_rgba(58,40,25,0.1)]">
          <div>
            <p className="eyebrow text-[var(--champagne-deep)]">Owner</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">Premium Tanımlama</h1>
          </div>
          <form method="post" action="/api/owner/logout">
            <button
              type="submit"
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/58 px-4 py-2.5 text-sm font-bold"
            >
              <LogOut className="size-4" />
              Çıkış
            </button>
          </form>
        </header>

        {error ? (
          <p className="rounded-[22px] border border-[rgba(124,58,49,0.2)] bg-[rgba(124,58,49,0.08)] p-4 text-sm font-bold text-[var(--rosewood)]">
            {error}
          </p>
        ) : null}
        {applied ? (
          <p className="rounded-[22px] border border-[rgba(77,122,91,0.22)] bg-[rgba(77,122,91,0.1)] p-4 text-sm font-bold text-[var(--ink)]">
            Premium Extension tanımlandı.
          </p>
        ) : null}

        <section className="rounded-[30px] border border-white/75 bg-[var(--paper-soft)] p-5 shadow-[0_18px_54px_rgba(58,40,25,0.1)]">
          <form method="get" action="/owner/upgrades" className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              name="studioCode"
              defaultValue={studioCode}
              placeholder="SY-ABCD-1234"
              className="focus-ring rounded-[18px] border border-[var(--line)] bg-white/70 px-4 py-3 font-mono text-base font-bold"
            />
            <button
              type="submit"
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-bold text-[var(--paper-soft)]"
            >
              <Search className="size-4" />
              Galeriyi Bul
            </button>
          </form>
        </section>

        {studioCode && !wedding ? (
          <p className="rounded-[22px] border border-[var(--line)] bg-white/52 p-4 text-sm font-bold text-[var(--ink-soft)]">
            Bu Studio Code ile galeri bulunamadı.
          </p>
        ) : null}

        {wedding ? (
          <section className="grid gap-5 lg:grid-cols-[1fr_22rem]">
            <article className="rounded-[30px] border border-white/75 bg-[var(--paper-soft)] p-5 shadow-[0_18px_54px_rgba(58,40,25,0.1)]">
              <p className="eyebrow text-[var(--champagne-deep)]">{wedding.studioCode}</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">{wedding.coupleName}</h2>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-[20px] border border-[var(--line)] bg-white/52 p-4">
                  <dt className="font-bold text-[var(--ink-soft)]">Paket</dt>
                  <dd className="mt-1 text-lg font-bold capitalize">{wedding.plan}</dd>
                </div>
                <div className="rounded-[20px] border border-[var(--line)] bg-white/52 p-4">
                  <dt className="font-bold text-[var(--ink-soft)]">Erişim bitişi</dt>
                  <dd className="mt-1 text-lg font-bold">{formatDate(wedding.accessExpiresAt)}</dd>
                </div>
                <div className="rounded-[20px] border border-[var(--line)] bg-white/52 p-4 sm:col-span-2">
                  <dt className="font-bold text-[var(--ink-soft)]">Depolama</dt>
                  <dd className="mt-1 text-lg font-bold">
                    {formatStorageBytes(wedding.storageUsedBytes)} / {formatStorageBytes(wedding.storageQuotaBytes)}
                  </dd>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[var(--champagne-deep)]"
                      style={{ width: `${Math.min(100, percent)}%` }}
                    />
                  </div>
                </div>
              </dl>
            </article>

            <aside className="rounded-[30px] border border-white/75 bg-[rgba(255,250,243,0.86)] p-5 shadow-[0_18px_54px_rgba(58,40,25,0.1)]">
              <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
                <Crown className="size-4" />
                Tanımla
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Premium Extension</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
                Mevcut erişim bitiş tarihinin üstüne 50 GB ve 6 ay ekler.
              </p>
              <form method="post" action="/api/owner/upgrades/apply" className="mt-5 grid gap-3">
                <input type="hidden" name="studioCode" value={wedding.studioCode} />
                <label className="grid gap-2 text-sm font-bold">
                  Etsy sipariş no
                  <span className="text-xs font-medium leading-relaxed text-[var(--ink-soft)]">
                    Premium satın alma sipariş numarası. Aynı sipariş no ikinci kez kullanılamaz.
                  </span>
                  <input
                    name="etsyOrderNumber"
                    className="focus-ring rounded-[18px] border border-[var(--line)] bg-white/70 px-4 py-3"
                    required
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  Not
                  <textarea
                    name="note"
                    className="focus-ring min-h-24 rounded-[18px] border border-[var(--line)] bg-white/70 px-4 py-3"
                  />
                </label>
                <button
                  type="submit"
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-bold text-[var(--paper-soft)]"
                >
                  <Crown className="size-4" />
                  +50 GB / +6 ay tanımla
                </button>
              </form>
            </aside>

            <article className="rounded-[30px] border border-white/75 bg-[var(--paper-soft)] p-5 shadow-[0_18px_54px_rgba(58,40,25,0.1)] lg:col-span-2">
              <h2 className="font-display text-2xl font-semibold">Son upgrade kayıtları</h2>
              {logs.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--ink-soft)]">Henüz upgrade uygulanmadı.</p>
              ) : (
                <div className="mt-4 grid gap-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="grid gap-2 rounded-[18px] border border-[var(--line)] bg-white/50 p-3 text-sm sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-bold">{log.etsy_order_number}</p>
                        <p className="text-[var(--ink-soft)]">{log.note || "Not yok"}</p>
                      </div>
                      <p className="font-mono text-xs font-bold text-[var(--ink-soft)]">
                        {formatDate(log.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>
        ) : null}
      </div>
    </main>
  );
}
