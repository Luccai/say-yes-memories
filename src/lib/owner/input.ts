import { validatePassword } from "@/lib/auth/passwords";

export type OwnerAuthErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_SETUP_CODE"
  | "WEAK_PASSWORD"
  | "PASSWORD_MISMATCH"
  | "INVALID_DEVICE_LABEL";

type ValidationFailure = {
  ok: false;
  code: OwnerAuthErrorCode;
};

function failure(code: OwnerAuthErrorCode): ValidationFailure {
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

function normalizeDeviceLabel(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validDeviceLabel(value: string) {
  return value.length >= 2 && value.length <= 80;
}

export function validateOwnerSetupRequest(raw: unknown) {
  const record = asRecord(raw);
  if (!record) {
    return failure("INVALID_REQUEST");
  }

  const setupCode = stringField(record, "setupCode").trim();
  const password = stringField(record, "password");
  const passwordConfirm = stringField(record, "passwordConfirm");
  const deviceLabel = normalizeDeviceLabel(stringField(record, "deviceLabel"));

  if (!setupCode || setupCode.length > 512) {
    return failure("INVALID_SETUP_CODE");
  }
  if (!validatePassword(password, "owner").ok) {
    return failure("WEAK_PASSWORD");
  }
  if (password !== passwordConfirm) {
    return failure("PASSWORD_MISMATCH");
  }
  if (!validDeviceLabel(deviceLabel)) {
    return failure("INVALID_DEVICE_LABEL");
  }

  return {
    ok: true as const,
    value: { setupCode, password, deviceLabel },
  };
}

export function validateOwnerLoginRequest(raw: unknown) {
  const record = asRecord(raw);
  if (!record) {
    return failure("INVALID_REQUEST");
  }

  const password = stringField(record, "password");
  const deviceLabel = normalizeDeviceLabel(stringField(record, "deviceLabel"));
  if (!validatePassword(password, "owner").ok) {
    return failure("WEAK_PASSWORD");
  }
  if (!validDeviceLabel(deviceLabel)) {
    return failure("INVALID_DEVICE_LABEL");
  }

  return { ok: true as const, value: { password, deviceLabel } };
}
