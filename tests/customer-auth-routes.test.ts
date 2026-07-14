import { beforeEach, describe, expect, mock, test } from "bun:test";
import { hashPassword } from "@/lib/auth/passwords";
import type { Wedding } from "@/lib/types";

process.env.AUTH_PASSWORD_PEPPER =
  "route-test-password-pepper-that-is-longer-than-32-bytes";
process.env.AUTH_RATE_LIMIT_SECRET =
  "route-test-rate-limit-secret-that-is-longer-than-32-bytes";

const storedPasswordHash = await hashPassword("a safe wedding passphrase");

const wedding: Wedding = {
  id: "wed_route_test",
  slug: "fatma-mihail",
  studioCode: "SY-TEST-ROUT",
  plan: "classic",
  storageQuotaBytes: 50 * 1024 ** 3,
  storageUsedBytes: 0,
  accessAnchorDate: "2026-08-15",
  accessExpiresAt: "2026-11-15T23:59:59.999Z",
  cleanupAfter: "2026-12-15T23:59:59.999Z",
  brideName: "Fatma",
  groomName: "Mihail",
  coupleName: "Fatma & Mihail",
  eventDate: "2026-08-15",
  welcomeNote: "Welcome",
  uploadLocked: false,
  createdAt: "2026-07-11T10:00:00.000Z",
  updatedAt: "2026-07-11T10:00:00.000Z",
};

type Credentials = {
  id: string;
  slug: string;
  brideName: string;
  groomName: string;
  passwordHash: string | null;
  passwordVersion: number;
  status: "active";
};

const credentials: Credentials = {
  id: wedding.id,
  slug: wedding.slug,
  brideName: wedding.brideName,
  groomName: wedding.groomName,
  passwordHash: storedPasswordHash,
  passwordVersion: 1,
  status: "active",
};

let activationState:
  | { state: "missing" }
  | { state: "unused" }
  | { state: "active"; credentials: Credentials };
let slugCredentials: Credentials | null;
let tokenCredentials: Credentials | null;
const activationCalls: Record<string, unknown>[] = [];
const sessionCalls: Record<string, unknown>[] = [];
const resetCalls: Record<string, unknown>[] = [];
const revokedTokens: string[] = [];
const deletedCookies: string[] = [];
let revokeShouldFail = false;
const RAW_SESSION = `sy_session_${"z".repeat(43)}`;

mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "sayyes_session" ? { value: RAW_SESSION } : undefined,
    delete: (name: string) => deletedCookies.push(name),
  }),
}));

mock.module("@/lib/auth/rate-limit", () => ({
  consumeCustomerAuthLimits: async () => ({
    allowed: true,
    retryAfterSeconds: 0,
    identifierKey: "a".repeat(64),
    identifierAction: "auth.test.identifier",
  }),
  clearCustomerIdentifierLimit: async () => undefined,
}));

mock.module("@/lib/auth/customer-store", () => ({
  getActivationTokenState: async () => activationState,
  activateCustomerWedding: async (input: Record<string, unknown>) => {
    activationCalls.push(input);
    return {
      result_wedding_id: wedding.id,
      result_slug: wedding.slug,
      result_session_id: input.sessionId,
    };
  },
  claimLegacyCustomerWedding: async () => credentials,
  createCustomerSession: async (input: Record<string, unknown>) => {
    sessionCalls.push(input);
    return input;
  },
  getCustomerWedding: async () => wedding,
  resolveCustomerBySlug: async () => slugCredentials,
  resolveCustomerByActiveToken: async () => tokenCredentials,
  resetCustomerPassword: async (input: Record<string, unknown>) => {
    resetCalls.push(input);
    return { ...credentials, passwordVersion: 2 };
  },
  getCustomerSession: async () => null,
  revokeCustomerSession: async (rawToken: string) => {
    revokedTokens.push(rawToken);
    if (revokeShouldFail) {
      throw new Error("database unavailable");
    }
  },
  consumeRateLimitBucket: async () => ({
    allowed: true,
    retry_after_seconds: 0,
    remaining_attempts: 4,
  }),
  clearRateLimitBucket: async () => undefined,
}));

const { POST: activate } = await import("../src/app/api/auth/activate/route");
const { POST: checkActivationToken } = await import(
  "../src/app/api/auth/activation-token/route"
);
const { POST: login } = await import("../src/app/api/auth/login/route");
const { POST: recover } = await import("../src/app/api/auth/recover/route");
const { POST: logout } = await import("../src/app/api/auth/logout/route");

function jsonRequest(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  activationState = { state: "unused" };
  slugCredentials = credentials;
  tokenCredentials = credentials;
  activationCalls.length = 0;
  sessionCalls.length = 0;
  resetCalls.length = 0;
  revokedTokens.length = 0;
  deletedCookies.length = 0;
  revokeShouldFail = false;
});

describe("customer auth routes", () => {
  test("checks activation eligibility without consuming the token", async () => {
    const response = await checkActivationToken(
      jsonRequest("/api/auth/activation-token", {
        token: "  syd-abcde-fghij-klmno-pqrst  ",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(activationCalls).toHaveLength(0);
    expect(sessionCalls).toHaveLength(0);
  });

  test("does not reveal whether an unavailable token is active", async () => {
    activationState = { state: "active", credentials };

    const response = await checkActivationToken(
      jsonRequest("/api/auth/activation-token", { token: "SYD-ABCDE-FGHIJ-KLMNO-PQRST" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "TOKEN_UNAVAILABLE" });
  });

  test("keeps legacy passwordless memberships eligible for setup", async () => {
    activationState = {
      state: "active",
      credentials: { ...credentials, passwordHash: null },
    };

    const response = await checkActivationToken(
      jsonRequest("/api/auth/activation-token", { token: "SYD-ABCDE-FGHIJ-KLMNO-PQRST" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
  });

  test("activates atomically and places only a random session secret in the cookie", async () => {
    const response = await activate(
      jsonRequest("/api/auth/activate", {
        token: "SYD-ABC-DEF",
        brideName: "Fatma",
        groomName: "Mihail",
        password: "a safe wedding passphrase",
        passwordConfirm: "a safe wedding passphrase",
        eventDate: "2026-08-15",
        timezone: "Europe/Istanbul",
        activationKey: "a".repeat(43),
      }),
    );

    expect(response.status).toBe(200);
    expect(activationCalls).toHaveLength(1);
    expect(activationCalls[0]).toMatchObject({
      brideName: "Fatma",
      groomName: "Mihail",
      eventDate: "2026-08-15",
      timezone: "Europe/Istanbul",
      baseSlug: "fatma-mihail",
    });
    expect(activationCalls[0].passwordHash).not.toBe("a safe wedding passphrase");
    expect(activationCalls[0].sessionTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.get("set-cookie")).toMatch(
      /sayyes_session=sy_session_[A-Za-z0-9_-]{43}/,
    );
    expect(await response.json()).toMatchObject({
      wedding: { id: wedding.id, slug: wedding.slug },
    });
  });

  test("logs in from a remembered slug only after password verification", async () => {
    const response = await login(
      jsonRequest("/api/auth/login", {
        slug: "fatma-mihail",
        password: "a safe wedding passphrase",
      }),
    );

    expect(response.status).toBe(200);
    expect(sessionCalls).toHaveLength(1);
    expect(sessionCalls[0]).toMatchObject({
      weddingId: wedding.id,
      passwordVersion: 1,
    });
    expect(sessionCalls[0].sessionTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("does not create a session for a wrong new-device password", async () => {
    const response = await login(
      jsonRequest("/api/auth/login", {
        token: "SYD-ABC-DEF",
        password: "the wrong password",
      }),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("INVALID_CREDENTIALS");
    expect(sessionCalls).toHaveLength(0);
  });

  test("resets by active token and creates only the new password-version session", async () => {
    const response = await recover(
      jsonRequest("/api/auth/recover", {
        token: "SYD-ABC-DEF",
        password: "a new safe passphrase",
        passwordConfirm: "a new safe passphrase",
      }),
    );

    expect(response.status).toBe(200);
    expect(resetCalls).toHaveLength(1);
    expect(resetCalls[0].passwordHash).not.toBe("a new safe passphrase");
    expect(sessionCalls).toHaveLength(1);
    expect(sessionCalls[0]).toMatchObject({ passwordVersion: 2 });
  });

  test("logout revokes the server session before removing the browser cookie", async () => {
    const response = await logout();

    expect(response.status).toBe(200);
    expect(revokedTokens).toEqual([RAW_SESSION]);
    expect(deletedCookies).toEqual(["sayyes_session"]);
    expect(response.headers.get("set-cookie")).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
  });

  test("logout still removes the browser cookie when server revocation fails", async () => {
    revokeShouldFail = true;

    const response = await logout();

    expect(response.status).toBe(503);
    expect(revokedTokens).toEqual([RAW_SESSION]);
    expect(deletedCookies).toEqual(["sayyes_session"]);
    expect(response.headers.get("set-cookie")).toContain(
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
  });
});
