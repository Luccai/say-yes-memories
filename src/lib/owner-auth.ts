import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const OWNER_COOKIE_NAME = "sayyes_owner";
const OWNER_COOKIE_MAX_AGE = 60 * 60 * 8;

function ownerSecretHash() {
  const password = process.env.OWNER_ADMIN_PASSWORD;

  if (!password) {
    return null;
  }

  return createHash("sha256").update(password).digest("hex");
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyOwnerPassword(password: string) {
  const secretHash = ownerSecretHash();

  if (!secretHash) {
    return false;
  }

  const expected = Buffer.from(secretHash, "hex");
  const actual = Buffer.from(hashValue(password), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isOwnerPasswordConfigured() {
  return ownerSecretHash() !== null;
}

export async function isOwnerAuthenticated() {
  const secretHash = ownerSecretHash();

  if (!secretHash) {
    return false;
  }

  const cookieStore = await cookies();
  const cookie = cookieStore.get(OWNER_COOKIE_NAME)?.value;

  if (!cookie) {
    return false;
  }

  return cookie === secretHash;
}

export async function setOwnerCookie() {
  const secretHash = ownerSecretHash();

  if (!secretHash) {
    throw new Error("OWNER_ADMIN_PASSWORD is missing.");
  }

  const cookieStore = await cookies();
  cookieStore.set(OWNER_COOKIE_NAME, secretHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OWNER_COOKIE_MAX_AGE,
  });
}

export async function clearOwnerCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(OWNER_COOKIE_NAME);
}
