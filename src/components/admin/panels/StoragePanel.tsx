"use client";

import { useState } from "react";
import { Crown, HardDrive } from "lucide-react";
import { PremiumExtensionDialog } from "@/components/admin/storage/PremiumExtensionDialog";
import { StorageMeter } from "@/components/admin/storage/StorageMeter";
import { Button } from "@/components/shared/Button";
import type { useCopy } from "@/lib/i18n-client";
import { resolvePremiumPurchaseAction } from "@/lib/premium-purchase";
import {
  formatStorageBytes,
  getStorageLevel,
  isAccessExpired,
  storageUsagePercent,
} from "@/lib/storage/quota";
import type { Wedding } from "@/lib/types";

type AdminCopy = ReturnType<typeof useCopy>["admin"];

type StoragePanelProps = {
  wedding: Wedding;
  demoMode: boolean;
  text: AdminCopy;
};

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replace(`{${key}}`, String(value)),
    template,
  );
}

function daysUntil(isoDateTime?: string) {
  if (!isoDateTime) {
    return null;
  }

  return Math.ceil((new Date(isoDateTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function storageStatusText(text: AdminCopy, wedding: Wedding) {
  if (isAccessExpired(wedding)) {
    return text.storageExpired;
  }

  const level = getStorageLevel(wedding);

  if (level === "full") {
    return text.storageFull;
  }

  if (level === "critical") {
    return text.storageCritical;
  }

  if (level === "warning") {
    return text.storageWarning;
  }

  return text.storageHealthy;
}

export function StoragePanel({ wedding, demoMode, text }: StoragePanelProps) {
  const [premiumOpen, setPremiumOpen] = useState(false);
  const premiumUpgradeUrl = process.env.NEXT_PUBLIC_ETSY_PREMIUM_UPGRADE_URL;
  const isDemoStorage = Boolean(demoMode || wedding.demo);
  const premiumPurchaseAction = resolvePremiumPurchaseAction({
    demoMode: isDemoStorage,
    upgradeUrl: premiumUpgradeUrl,
  });
  const displayedUsedBytes = isDemoStorage
    ? Math.round(8.4 * 1024 * 1024 * 1024)
    : wedding.storageUsedBytes;
  const displayedQuotaBytes = isDemoStorage ? 50 * 1024 * 1024 * 1024 : wedding.storageQuotaBytes;
  const percent = storageUsagePercent(displayedUsedBytes, displayedQuotaBytes);
  const usedLabel = formatStorageBytes(displayedUsedBytes);
  const quotaLabel = formatStorageBytes(displayedQuotaBytes);
  const remainingDays = isDemoStorage ? 74 : daysUntil(wedding.accessExpiresAt);
  const status = isDemoStorage ? text.storageHealthy : storageStatusText(text, wedding);
  const planLabel = isDemoStorage ? "Classic" : wedding.plan === "premium" ? "Premium" : "Classic";

  return (
    <>
      <article className="overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.84)] p-4 shadow-none backdrop-blur sm:p-6 sm:shadow-[0_20px_58px_rgba(58,40,25,0.1)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-[var(--champagne-deep)]">
              <HardDrive className="size-4 shrink-0" />
              {text.storageEyebrow}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[rgba(139,107,63,0.24)] bg-white/58 px-3 py-1 text-[0.72rem] font-bold uppercase text-[var(--champagne-deep)]">
                {planLabel}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{status}</p>

            <StorageMeter
              label={fillTemplate(text.storageUsedOf, { used: usedLabel, quota: quotaLabel })}
              percent={percent}
            />
          </div>

          <div className="grid shrink-0 justify-items-start gap-4 sm:justify-items-end">
            <Button onClick={() => setPremiumOpen(true)} variant="premium" size="compact">
              <Crown className="size-3.5" />
              <span>{text.premiumPill}</span>
            </Button>
            <p className="text-xs font-bold text-[var(--ink-soft)]">
              {remainingDays === null
                ? text.storageNoDate
                : fillTemplate(text.storageDaysLeft, { days: Math.max(0, remainingDays) })}
            </p>
          </div>
        </div>
        {isDemoStorage ? (
          <p className="mt-5 rounded-[18px] border border-[rgba(139,107,63,0.18)] bg-[rgba(255,250,243,0.72)] px-3 py-2 text-xs font-bold leading-5 text-[var(--ink-soft)]">
            {text.demoStorageNotice}
          </p>
        ) : null}
      </article>

      <PremiumExtensionDialog
        open={premiumOpen}
        wedding={wedding}
        demoMode={isDemoStorage}
        purchaseAction={premiumPurchaseAction}
        text={text}
        onClose={() => setPremiumOpen(false)}
      />
    </>
  );
}
