import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "sayyes_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function normalizeToken(token: string) {
  return token.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashToken(token: string) {
  return createHash("sha256").update(normalizeToken(token)).digest("hex");
}

export function createId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function createPublicToken() {
  const parts = [
    randomBytes(3).toString("hex"),
    randomBytes(3).toString("hex"),
    randomBytes(3).toString("hex"),
  ];
  return `SYD-${parts.join("-")}`.toUpperCase();
}

export function createStudioCode() {
  const parts = [randomBytes(2).toString("hex"), randomBytes(2).toString("hex")];
  return `SY-${parts.join("-")}`.toUpperCase();
}
