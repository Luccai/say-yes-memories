import { validatePassword } from "@/lib/auth/passwords";
import { normalizeEtsyToken } from "@/lib/auth/etsy-token";

export { normalizeEtsyToken } from "@/lib/auth/etsy-token";

export type CustomerAuthErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_TOKEN"
  | "INVALID_NAMES"
  | "WEAK_PASSWORD"
  | "PASSWORD_MISMATCH"
  | "INVALID_EVENT_DATE"
  | "EVENT_DATE_IN_PAST"
  | "INVALID_TIMEZONE"
  | "INVALID_ACTIVATION_KEY"
  | "INVALID_LOGIN_IDENTIFIER";

type ValidationFailure = {
  ok: false;
  code: CustomerAuthErrorCode;
};

function failure(code: CustomerAuthErrorCode): ValidationFailure {
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

function validToken(value: string) {
  return value.length >= 8 && value.length <= 160;
}

export function validateActivationTokenRequest(raw: unknown) {
  const record = asRecord(raw);
  if (!record) {
    return failure("INVALID_REQUEST");
  }

  const token = normalizeEtsyToken(stringField(record, "token"));
  if (!validToken(token)) {
    return failure("INVALID_TOKEN");
  }

  return { ok: true as const, value: { token } };
}

function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function localDateAt(now: Date, timezone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return { year: values.year, month: values.month, day: values.day };
}

function compareCalendarDates(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number },
) {
  return (
    Date.UTC(left.year, left.month - 1, left.day) -
    Date.UTC(right.year, right.month - 1, right.day)
  );
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function validateActivationRequest(raw: unknown, now = new Date()) {
  const record = asRecord(raw);
  if (!record) {
    return failure("INVALID_REQUEST");
  }

  const token = normalizeEtsyToken(stringField(record, "token"));
  const brideName = stringField(record, "brideName").trim();
  const groomName = stringField(record, "groomName").trim();
  const password = stringField(record, "password");
  const passwordConfirm = stringField(record, "passwordConfirm");
  const eventDate = stringField(record, "eventDate").trim();
  const timezone = stringField(record, "timezone").trim();
  const activationKey = stringField(record, "activationKey").trim();

  if (!validToken(token)) {
    return failure("INVALID_TOKEN");
  }
  if (
    !brideName ||
    !groomName ||
    brideName.length > 80 ||
    groomName.length > 80
  ) {
    return failure("INVALID_NAMES");
  }

  const passwordResult = validatePassword(password, "customer");
  if (!passwordResult.ok) {
    return failure("WEAK_PASSWORD");
  }
  if (password !== passwordConfirm) {
    return failure("PASSWORD_MISMATCH");
  }
  if (!isValidTimezone(timezone)) {
    return failure("INVALID_TIMEZONE");
  }

  const parsedEventDate = parseCalendarDate(eventDate);
  if (!parsedEventDate) {
    return failure("INVALID_EVENT_DATE");
  }
  if (compareCalendarDates(parsedEventDate, localDateAt(now, timezone)) < 0) {
    return failure("EVENT_DATE_IN_PAST");
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(activationKey)) {
    return failure("INVALID_ACTIVATION_KEY");
  }

  return {
    ok: true as const,
    value: {
      token,
      brideName,
      groomName,
      password,
      eventDate,
      timezone,
      activationKey,
    },
  };
}

export function validateLoginRequest(raw: unknown) {
  const record = asRecord(raw);
  if (!record) {
    return failure("INVALID_REQUEST");
  }

  const slug = stringField(record, "slug").trim().toLowerCase();
  const token = normalizeEtsyToken(stringField(record, "token"));
  const password = stringField(record, "password");
  const hasSlug = Boolean(slug);
  const hasToken = Boolean(token);

  if (hasSlug === hasToken) {
    return failure("INVALID_LOGIN_IDENTIFIER");
  }
  if (hasSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return failure("INVALID_LOGIN_IDENTIFIER");
  }
  if (hasToken && !validToken(token)) {
    return failure("INVALID_TOKEN");
  }
  if (!validatePassword(password, "customer").ok) {
    return failure("WEAK_PASSWORD");
  }

  return {
    ok: true as const,
    value: {
      mode: hasSlug ? ("slug" as const) : ("token" as const),
      identifier: hasSlug ? slug : token,
      password,
    },
  };
}

export function validateRecoveryRequest(raw: unknown) {
  const record = asRecord(raw);
  if (!record) {
    return failure("INVALID_REQUEST");
  }

  const token = normalizeEtsyToken(stringField(record, "token"));
  const password = stringField(record, "password");
  const passwordConfirm = stringField(record, "passwordConfirm");

  if (!validToken(token)) {
    return failure("INVALID_TOKEN");
  }
  if (!validatePassword(password, "customer").ok) {
    return failure("WEAK_PASSWORD");
  }
  if (password !== passwordConfirm) {
    return failure("PASSWORD_MISMATCH");
  }

  return {
    ok: true as const,
    value: { token, password },
  };
}
