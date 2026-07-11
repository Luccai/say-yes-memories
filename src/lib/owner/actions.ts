import { validatePassword } from "@/lib/auth/passwords";
import { makeBaseWeddingSlug } from "@/lib/text";

export type OwnerActionErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_ID"
  | "INVALID_OPERATION_KEY"
  | "INVALID_LABEL"
  | "INVALID_REASON"
  | "INVALID_NAMES"
  | "INVALID_EVENT_DATE"
  | "INVALID_TIMEZONE"
  | "WEAK_PASSWORD"
  | "PASSWORD_MISMATCH"
  | "INVALID_DEVICE_LABEL"
  | "CONFIRMATION_MISMATCH";

type ValidationFailure = { ok: false; code: OwnerActionErrorCode };

function failure(code: OwnerActionErrorCode): ValidationFailure {
  return { ok: false, code };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : "";
}

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function operationKey(record: Record<string, unknown>) {
  const value = stringField(record, "operationKey").trim();
  return /^[A-Za-z0-9:_-]{8,160}$/.test(value) ? value : null;
}

function optionalNote(record: Record<string, unknown>) {
  const value = stringField(record, "note").trim();
  return value.slice(0, 500);
}

function validCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1900 &&
    year <= 2200 &&
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function validOwnerResourceId(value: string) {
  return /^[A-Za-z0-9_-]{3,160}$/.test(value);
}

export function validateTokenIssue(raw: unknown) {
  const record = asRecord(raw);
  if (!record) return failure("INVALID_REQUEST");
  const label = normalizeSpaces(stringField(record, "label"));
  const key = operationKey(record);
  if (!key) return failure("INVALID_OPERATION_KEY");
  if (label.length < 1 || label.length > 80) return failure("INVALID_LABEL");
  return { ok: true as const, value: { label, operationKey: key } };
}

export const validateTokenRotation = validateTokenIssue;

export function validateTokenRevocation(raw: unknown) {
  const record = asRecord(raw);
  if (!record) return failure("INVALID_REQUEST");
  const reason = normalizeSpaces(stringField(record, "reason"));
  const key = operationKey(record);
  if (!key) return failure("INVALID_OPERATION_KEY");
  if (reason.length < 3 || reason.length > 500) return failure("INVALID_REASON");
  return { ok: true as const, value: { reason, operationKey: key } };
}

export function validateOwnerIdentityUpdate(raw: unknown) {
  const record = asRecord(raw);
  if (!record) return failure("INVALID_REQUEST");
  const brideName = normalizeSpaces(stringField(record, "brideName"));
  const groomName = normalizeSpaces(stringField(record, "groomName"));
  const eventDate = stringField(record, "eventDate").trim();
  const timezone = stringField(record, "timezone").trim();
  const key = operationKey(record);
  if (!key) return failure("INVALID_OPERATION_KEY");
  if (!brideName || !groomName || brideName.length > 80 || groomName.length > 80) {
    return failure("INVALID_NAMES");
  }
  if (!validCalendarDate(eventDate)) return failure("INVALID_EVENT_DATE");
  if (!validTimezone(timezone)) return failure("INVALID_TIMEZONE");
  return {
    ok: true as const,
    value: {
      brideName,
      groomName,
      eventDate,
      timezone,
      baseSlug: makeBaseWeddingSlug(brideName, groomName),
      operationKey: key,
      note: optionalNote(record),
    },
  };
}

export function validateExtensionApply(raw: unknown) {
  const record = asRecord(raw);
  if (!record) return failure("INVALID_REQUEST");
  const key = operationKey(record);
  if (!key) return failure("INVALID_OPERATION_KEY");
  return {
    ok: true as const,
    value: { operationKey: key, note: optionalNote(record) },
  };
}

export function validateEntitlementReversal(raw: unknown) {
  return validateTokenRevocation(raw);
}

export function validateCleanupApproval(raw: unknown, expectedSlug: string) {
  const record = asRecord(raw);
  if (!record) return failure("INVALID_REQUEST");
  const key = operationKey(record);
  if (!key) return failure("INVALID_OPERATION_KEY");
  if (stringField(record, "confirmation").trim() !== expectedSlug) {
    return failure("CONFIRMATION_MISMATCH");
  }
  return { ok: true as const, value: { operationKey: key } };
}

export function validateSessionRevocation(raw: unknown) {
  const record = asRecord(raw);
  if (!record) return failure("INVALID_REQUEST");
  const key = operationKey(record);
  if (!key) return failure("INVALID_OPERATION_KEY");
  return { ok: true as const, value: { operationKey: key } };
}

export function validateOwnerPasswordChange(raw: unknown) {
  const record = asRecord(raw);
  if (!record) return failure("INVALID_REQUEST");
  const currentPassword = stringField(record, "currentPassword");
  const password = stringField(record, "password");
  const passwordConfirm = stringField(record, "passwordConfirm");
  const deviceLabel = normalizeSpaces(stringField(record, "deviceLabel"));
  const key = operationKey(record);
  if (!key) return failure("INVALID_OPERATION_KEY");
  if (!validatePassword(currentPassword, "owner").ok) return failure("WEAK_PASSWORD");
  if (!validatePassword(password, "owner").ok) return failure("WEAK_PASSWORD");
  if (password !== passwordConfirm) return failure("PASSWORD_MISMATCH");
  if (deviceLabel.length < 2 || deviceLabel.length > 80) {
    return failure("INVALID_DEVICE_LABEL");
  }
  return {
    ok: true as const,
    value: {
      currentPassword,
      password,
      deviceLabel,
      operationKey: key,
    },
  };
}
