import { createHash, randomBytes } from "node:crypto";

const OWNER_SESSION_PREFIX = "sy_owner_";

export function hashOwnerSessionToken(rawToken: string) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function createOwnerSessionToken() {
  const rawToken = `${OWNER_SESSION_PREFIX}${randomBytes(32).toString("base64url")}`;

  return {
    id: `owner_sess_${randomBytes(12).toString("hex")}`,
    rawToken,
    tokenHash: hashOwnerSessionToken(rawToken),
  };
}

export function isOwnerSessionToken(value: string | undefined): value is string {
  return Boolean(value && /^sy_owner_[A-Za-z0-9_-]{43}$/.test(value));
}
