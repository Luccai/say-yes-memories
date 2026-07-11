import type { ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { Button } from "@/components/shared/Button";

export function OwnerPanelHeader({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-[30px] border border-white/75 bg-[rgba(255,250,243,0.82)] p-5 backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between sm:p-7">
      <div className="max-w-3xl">
        <p className="eyebrow text-[var(--champagne-deep)]">{eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-semibold leading-none sm:text-4xl">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{body}</p>
      </div>
      {action}
    </header>
  );
}

export function OwnerLoading({ label = "Veriler hazırlanıyor..." }: { label?: string }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
      {[0, 1, 2].map((item) => (
        <div key={item} className="min-h-40 animate-pulse rounded-[28px] border border-white/65 bg-white/45 p-5">
          <div className="h-3 w-24 rounded-full bg-white/75" />
          <div className="mt-6 h-10 w-32 rounded-full bg-white/80" />
          <div className="mt-5 h-3 w-full rounded-full bg-white/65" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function OwnerErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="mt-4 rounded-[28px] border border-red-200 bg-red-50/85 p-5 text-[var(--rosewood)]" role="alert">
      <AlertCircle className="size-5" />
      <p className="mt-3 font-bold">Bu bölüm şu an yüklenemedi.</p>
      <p className="mt-1 text-sm leading-6">Bağlantıyı kontrol edip tekrar deneyebilirsin.</p>
      <Button variant="danger" className="mt-4" onClick={retry}>Tekrar dene</Button>
    </div>
  );
}

export function OwnerEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 rounded-[28px] border border-white/70 bg-white/45 p-6 text-center">
      <Inbox className="mx-auto size-6 text-[var(--champagne-deep)]" />
      <p className="mt-3 font-display text-2xl font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--ink-soft)]">{body}</p>
    </div>
  );
}
