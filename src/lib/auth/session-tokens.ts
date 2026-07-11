import { createHash, randomBytes } from "node:crypto";

const SESSION_TOKEN_PREFIX = "sy_session_";

export function hashSessionToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function hashActivationKey(rawKey: string) {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function createSessionToken() {
  const rawToken = `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

  return {
    id: `sess_${randomBytes(12).toString("hex")}`,
    rawToken,
    tokenHash: hashSessionToken(rawToken),
  };
}

export function isSessionToken(value: string | undefined): value is string {
  return Boolean(value && /^sy_session_[A-Za-z0-9_-]{43}$/.test(value));
}
