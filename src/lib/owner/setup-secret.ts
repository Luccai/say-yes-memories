import { createHash, timingSafeEqual } from "node:crypto";

const MINIMUM_SETUP_SECRET_BYTES = 32;

function setupSecret(override?: string) {
  const value = override ?? process.env.OWNER_SETUP_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < MINIMUM_SETUP_SECRET_BYTES) {
    throw new Error("OWNER_SETUP_SECRET must contain at least 32 bytes.");
  }
  return value;
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyOwnerSetupCode(provided: string, override?: string) {
  const expectedDigest = digest(setupSecret(override));
  const providedDigest = digest(provided);
  return timingSafeEqual(expectedDigest, providedDigest);
}
