import { describe, expect, test } from "bun:test";
import {
  validateOwnerLoginRequest,
  validateOwnerSetupRequest,
} from "@/lib/owner/input";
import {
  createOwnerSessionToken,
  isOwnerSessionToken,
} from "@/lib/owner/session-tokens";
import { verifyOwnerSetupCode } from "@/lib/owner/setup-secret";
import { createOwnerAccessToken } from "@/lib/owner/access-tokens";

const SETUP_SECRET = "owner-setup-secret-that-is-longer-than-32-bytes";

describe("owner authentication security", () => {
  test("uses a high-entropy owner session secret and stores only its hash", () => {
    const session = createOwnerSessionToken();

    expect(session.id).toMatch(/^owner_sess_[a-f0-9]{24}$/);
    expect(session.rawToken).toMatch(/^sy_owner_[A-Za-z0-9_-]{43}$/);
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.rawToken).not.toBe(session.tokenHash);
    expect(isOwnerSessionToken(session.rawToken)).toBeTrue();
    expect(isOwnerSessionToken(`sy_session_${"a".repeat(43)}`)).toBeFalse();
  });

  test("shows a newly issued Etsy token once while keeping only its hash", () => {
    const token = createOwnerAccessToken();

    expect(token.id).toMatch(/^tok_[a-f0-9]{24}$/);
    expect(token.rawToken).toMatch(
      /^SYD-[A-HJ-NP-Z2-9]{5}(?:-[A-HJ-NP-Z2-9]{5}){3}$/,
    );
    expect(token.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(token.tokenHash).not.toContain(token.rawToken);
  });

  test("accepts only the configured one-time setup code", () => {
    expect(verifyOwnerSetupCode(SETUP_SECRET, SETUP_SECRET)).toBeTrue();
    expect(verifyOwnerSetupCode("wrong setup code", SETUP_SECRET)).toBeFalse();
    expect(() => verifyOwnerSetupCode(SETUP_SECRET, "short")).toThrow();
  });

  test("requires a matching 12-character owner password and a device label", () => {
    const valid = validateOwnerSetupRequest({
      setupCode: SETUP_SECRET,
      password: "owner passphrase 2026",
      passwordConfirm: "owner passphrase 2026",
      deviceLabel: "Mihail'in bilgisayarı",
    });
    const weak = validateOwnerSetupRequest({
      setupCode: SETUP_SECRET,
      password: "too-short",
      passwordConfirm: "too-short",
      deviceLabel: "Laptop",
    });

    expect(valid.ok).toBeTrue();
    expect(weak).toEqual({ ok: false, code: "WEAK_PASSWORD" });
    expect(
      validateOwnerLoginRequest({
        password: "owner passphrase 2026",
        deviceLabel: "Mihail'in bilgisayarı",
      }).ok,
    ).toBeTrue();
  });
});
