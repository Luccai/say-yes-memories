import { describe, expect, test } from "bun:test";
import {
  CUSTOMER_PASSWORD_MIN_LENGTH,
  OWNER_PASSWORD_MIN_LENGTH,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/auth/passwords";
import {
  createSessionToken,
  hashActivationKey,
  hashSessionToken,
} from "@/lib/auth/session-tokens";

const TEST_PEPPER = "test-password-pepper-that-is-at-least-32-characters";

describe("password storage", () => {
  test("enforces customer and owner minimums without hidden complexity rules", () => {
    expect(CUSTOMER_PASSWORD_MIN_LENGTH).toBe(10);
    expect(OWNER_PASSWORD_MIN_LENGTH).toBe(12);
    expect(validatePassword("123456789", "customer").ok).toBeFalse();
    expect(validatePassword("1234567890", "customer").ok).toBeTrue();
    expect(validatePassword("12345678901", "owner").ok).toBeFalse();
    expect(validatePassword("a calm 12 word passphrase", "owner").ok).toBeTrue();
  });

  test("uses a unique salt and verifies only with the server pepper", async () => {
    const password = "a wedding passphrase";
    const firstHash = await hashPassword(password, TEST_PEPPER);
    const secondHash = await hashPassword(password, TEST_PEPPER);

    expect(firstHash).not.toBe(secondHash);
    expect(firstHash).not.toContain(password);
    expect(await verifyPassword(password, firstHash, TEST_PEPPER)).toBeTrue();
    expect(await verifyPassword("wrong password", firstHash, TEST_PEPPER)).toBeFalse();
    expect(
      await verifyPassword(password, firstHash, "another-pepper-that-is-also-long-enough"),
    ).toBeFalse();
  });

  test("fails closed for malformed stored hashes", async () => {
    expect(await verifyPassword("password", "not-a-valid-hash", TEST_PEPPER)).toBeFalse();
  });
});

describe("session secrets", () => {
  test("stores only a deterministic hash of a high-entropy browser token", () => {
    const session = createSessionToken();

    expect(session.id).toMatch(/^sess_[a-f0-9]{24}$/);
    expect(session.rawToken).toMatch(/^sy_session_[A-Za-z0-9_-]{43}$/);
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.rawToken).not.toBe(session.tokenHash);
    expect(hashSessionToken(session.rawToken)).toBe(session.tokenHash);
  });

  test("hashes the browser activation retry key before database storage", () => {
    const rawActivationKey = "a".repeat(43);
    const storedHash = hashActivationKey(rawActivationKey);

    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedHash).not.toContain(rawActivationKey);
  });

  test("creates a fresh secret for every login", () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first.id).not.toBe(second.id);
    expect(first.rawToken).not.toBe(second.rawToken);
    expect(first.tokenHash).not.toBe(second.tokenHash);
  });
});
