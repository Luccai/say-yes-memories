import { randomBytes } from "node:crypto";
import { hashToken } from "@/lib/security";

const ACCESS_TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createOwnerAccessToken() {
  const entropy = randomBytes(20);
  const characters = Array.from(
    entropy,
    (value) => ACCESS_TOKEN_ALPHABET[value % ACCESS_TOKEN_ALPHABET.length],
  ).join("");
  const groups = characters.match(/.{5}/g) ?? [];
  const rawToken = `SYD-${groups.join("-")}`;

  return {
    id: `tok_${randomBytes(12).toString("hex")}`,
    rawToken,
    tokenHash: hashToken(rawToken),
  };
}
