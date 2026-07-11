export const ownerInputClass =
  "focus-ring min-h-12 w-full rounded-[18px] border border-[var(--line)] bg-white/64 px-4 py-3 text-[16px] text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)]/55";

export async function ownerApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { code?: string })
    | null;
  if (!response.ok || !payload) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("sayyes-owner-session-expired"));
    }
    const error = new Error(payload?.code ?? "OWNER_REQUEST_FAILED");
    error.name = response.status === 401 ? "OwnerSessionExpired" : "OwnerRequestError";
    throw error;
  }
  return payload;
}

export function createOperationKey(prefix: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${suffix}`;
}

export function formatOwnerDate(value?: string | null, withTime = false) {
  if (!value) return "Ayarlanmamış";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}

export function formatOwnerBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 GB";
  const gib = value / 1024 ** 3;
  return `${gib >= 10 ? gib.toFixed(0) : gib.toFixed(1)} GB`;
}

export function ownerStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Aktif",
    disabled: "Devre dışı",
    cleanup_pending: "Temizlik sırada",
    anonymized: "Silinmiş",
    unused: "Kullanılmadı",
    revoked: "İptal edildi",
  };
  return labels[status] ?? status;
}
