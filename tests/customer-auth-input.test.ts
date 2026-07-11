import { describe, expect, test } from "bun:test";
import {
  validateActivationRequest,
  validateLoginRequest,
  validateRecoveryRequest,
} from "@/lib/auth/customer-input";

const ACTIVATION_KEY = "a".repeat(43);
const NOW = new Date("2026-07-11T21:30:00.000Z");

describe("customer activation input", () => {
  test("accepts a complete first activation at the customer's local today", () => {
    const result = validateActivationRequest(
      {
        token: " syd-abc-def ",
        brideName: " Fatma ",
        groomName: " Mihail ",
        password: "a safe wedding passphrase",
        passwordConfirm: "a safe wedding passphrase",
        eventDate: "2026-07-12",
        timezone: "Europe/Istanbul",
        activationKey: ACTIVATION_KEY,
      },
      NOW,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        token: "syd-abc-def",
        brideName: "Fatma",
        groomName: "Mihail",
        password: "a safe wedding passphrase",
        eventDate: "2026-07-12",
        timezone: "Europe/Istanbul",
        activationKey: ACTIVATION_KEY,
      },
    });
  });

  test("rejects past local dates, mismatched passwords and fake timezones", () => {
    expect(
      validateActivationRequest(
        {
          token: "syd-abc-def",
          brideName: "Fatma",
          groomName: "Mihail",
          password: "a safe wedding passphrase",
          passwordConfirm: "different passphrase",
          eventDate: "2026-07-11",
          timezone: "Europe/Istanbul",
          activationKey: ACTIVATION_KEY,
        },
        NOW,
      ),
    ).toMatchObject({ ok: false, code: "PASSWORD_MISMATCH" });

    expect(
      validateActivationRequest(
        {
          token: "syd-abc-def",
          brideName: "Fatma",
          groomName: "Mihail",
          password: "a safe wedding passphrase",
          passwordConfirm: "a safe wedding passphrase",
          eventDate: "2026-07-11",
          timezone: "Europe/Istanbul",
          activationKey: ACTIVATION_KEY,
        },
        NOW,
      ),
    ).toMatchObject({ ok: false, code: "EVENT_DATE_IN_PAST" });

    expect(
      validateActivationRequest(
        {
          token: "syd-abc-def",
          brideName: "Fatma",
          groomName: "Mihail",
          password: "a safe wedding passphrase",
          passwordConfirm: "a safe wedding passphrase",
          eventDate: "2026-07-12",
          timezone: "Mars/Olympus",
          activationKey: ACTIVATION_KEY,
        },
        NOW,
      ),
    ).toMatchObject({ ok: false, code: "INVALID_TIMEZONE" });
  });
});

describe("returning customer input", () => {
  test("accepts same-device slug login or new-device token login", () => {
    expect(
      validateLoginRequest({
        slug: "fatma-mihail-2",
        password: "a safe wedding passphrase",
      }),
    ).toMatchObject({ ok: true, value: { mode: "slug", identifier: "fatma-mihail-2" } });

    expect(
      validateLoginRequest({
        token: " SYD-ABC-DEF ",
        password: "a safe wedding passphrase",
      }),
    ).toMatchObject({ ok: true, value: { mode: "token", identifier: "SYD-ABC-DEF" } });
  });

  test("does not accept ambiguous identifiers", () => {
    expect(
      validateLoginRequest({
        slug: "fatma-mihail",
        token: "SYD-ABC-DEF",
        password: "a safe wedding passphrase",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_LOGIN_IDENTIFIER" });
  });

  test("validates token recovery with the customer password policy", () => {
    expect(
      validateRecoveryRequest({
        token: "SYD-ABC-DEF",
        password: "123456789",
        passwordConfirm: "123456789",
      }),
    ).toMatchObject({ ok: false, code: "WEAK_PASSWORD" });

    expect(
      validateRecoveryRequest({
        token: "SYD-ABC-DEF",
        password: "1234567890",
        passwordConfirm: "1234567890",
      }),
    ).toMatchObject({ ok: true });
  });
});
