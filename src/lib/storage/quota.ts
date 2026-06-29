import type { Wedding } from "@/lib/types";

export const BYTES_PER_GB = 1024 ** 3;
export const CLASSIC_STORAGE_BYTES = 50 * BYTES_PER_GB;
export const PREMIUM_STORAGE_DELTA_BYTES = 50 * BYTES_PER_GB;
export const CLASSIC_ACCESS_MONTHS = 3;
export const PREMIUM_EXTENSION_MONTHS = 6;
export const ACTIVATION_FALLBACK_ACCESS_MONTHS = 6;
export const CLEANUP_GRACE_DAYS = 30;

export function formatStorageBytes(bytes: number) {
  const gb = bytes / BYTES_PER_GB;
  return `${gb.toLocaleString("en-US", {
    maximumFractionDigits: gb >= 10 ? 1 : 2,
    minimumFractionDigits: 0,
  })} GB`;
}

export function storageUsagePercent(usedBytes: number, quotaBytes: number) {
  if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (usedBytes / quotaBytes) * 100));
}

export function getStorageLevel(wedding: Pick<Wedding, "storageQuotaBytes" | "storageUsedBytes">) {
  const percent = storageUsagePercent(wedding.storageUsedBytes, wedding.storageQuotaBytes);

  if (percent >= 100) {
    return "full" as const;
  }

  if (percent >= 90) {
    return "critical" as const;
  }

  if (percent >= 80) {
    return "warning" as const;
  }

  return "ok" as const;
}

export function isAccessExpired(
  wedding: Pick<Wedding, "accessExpiresAt">,
  now = new Date(),
) {
  return Boolean(wedding.accessExpiresAt && new Date(wedding.accessExpiresAt).getTime() < now.getTime());
}

export function canAcceptGuestUpload(
  wedding: Pick<Wedding, "accessExpiresAt" | "storageQuotaBytes" | "storageUsedBytes" | "uploadLocked">,
  incomingBytes = 0,
  now = new Date(),
) {
  if (wedding.uploadLocked || isAccessExpired(wedding, now)) {
    return false;
  }

  return wedding.storageUsedBytes + incomingBytes <= wedding.storageQuotaBytes;
}

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addMonthsToDateEnd(date: string, months: number) {
  const [yearPart, monthPart, dayPart] = date.split("-").map(Number);

  if (!yearPart || !monthPart || !dayPart) {
    throw new Error("Access date is invalid.");
  }

  const startMonthIndex = monthPart - 1;
  const totalMonthIndex = startMonthIndex + months;
  const targetYear = yearPart + Math.floor(totalMonthIndex / 12);
  const targetMonthIndex = ((totalMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(dayPart, daysInUtcMonth(targetYear, targetMonthIndex));

  return new Date(Date.UTC(targetYear, targetMonthIndex, targetDay, 23, 59, 59, 999)).toISOString();
}

export function addDaysToIsoDateTime(isoDateTime: string, days: number) {
  const date = new Date(isoDateTime);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function buildAccessWindow(anchorDate: string, accessMonths: number) {
  const accessExpiresAt = addMonthsToDateEnd(anchorDate, accessMonths);

  return {
    accessAnchorDate: anchorDate,
    accessExpiresAt,
    cleanupAfter: addDaysToIsoDateTime(accessExpiresAt, CLEANUP_GRACE_DAYS),
  };
}

export function buildActivationFallbackWindow(now = new Date()) {
  const anchorDate = now.toISOString().slice(0, 10);
  const accessExpiresAt = addMonthsToDateEnd(anchorDate, ACTIVATION_FALLBACK_ACCESS_MONTHS);

  return {
    accessAnchorDate: anchorDate,
    accessExpiresAt,
    cleanupAfter: addDaysToIsoDateTime(accessExpiresAt, CLEANUP_GRACE_DAYS),
  };
}
