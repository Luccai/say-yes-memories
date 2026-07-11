import { beforeEach, describe, expect, mock, test } from "bun:test";
import { hashPassword } from "@/lib/auth/passwords";

process.env.AUTH_PASSWORD_PEPPER =
  "owner-route-password-pepper-that-is-longer-than-32-bytes";
process.env.AUTH_RATE_LIMIT_SECRET =
  "owner-route-rate-secret-that-is-longer-than-32-bytes";
process.env.OWNER_SETUP_SECRET =
  "owner-route-setup-secret-that-is-longer-than-32-bytes";

const storedPasswordHash = await hashPassword("owner passphrase 2026");
const setupCalls: Record<string, unknown>[] = [];
const sessionCalls: Record<string, unknown>[] = [];
let credentials: { passwordHash: string; passwordVersion: number } | null;
let touchedSession: Record<string, unknown> | null;
let logoutShouldFail = false;
const RAW_OWNER_SESSION = `sy_owner_${"z".repeat(43)}`;

mock.module("@/lib/owner/store", () => ({
  getOwnerCredentials: async () => credentials,
  setupOwner: async (input: Record<string, unknown>) => {
    setupCalls.push(input);
    credentials = { passwordHash: String(input.passwordHash), passwordVersion: 1 };
    return { id: input.sessionId, password_version: 1 };
  },
  createOwnerSession: async (input: Record<string, unknown>) => {
    sessionCalls.push(input);
    return { id: input.sessionId, password_version: input.passwordVersion };
  },
  touchOwnerSession: async () => touchedSession,
  logoutOwnerSession: async () => {
    if (logoutShouldFail) {
      throw new Error("database unavailable");
    }
  },
}));

mock.module("@/lib/owner/rate-limit", () => ({
  consumeOwnerAuthLimit: async () => ({
    allowed: true,
    retryAfterSeconds: 0,
    keyHash: "a".repeat(64),
    action: "auth.owner.test.ip",
  }),
  clearOwnerAuthLimit: async () => undefined,
}));

mock.module("@/lib/owner/request-metadata", () => ({
  ownerRequestMetadata: () => ({
    userAgentHash: "b".repeat(64),
    ipHash: "c".repeat(64),
  }),
}));

const { POST: setup } = await import("../src/app/api/owner/setup/route");
const { POST: login } = await import("../src/app/api/owner/login/route");
const { GET: session } = await import("../src/app/api/owner/session/route");
const { POST: logout } = await import("../src/app/api/owner/logout/route");

function jsonRequest(path: string, body: Record<string, unknown>) {
  return new Request(`https://memories.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  credentials = null;
  setupCalls.length = 0;
  sessionCalls.length = 0;
  touchedSession = null;
  logoutShouldFail = false;
});

describe("owner auth routes", () => {
  test("completes setup once and stores only a random session secret in the cookie", async () => {
    const response = await setup(
      jsonRequest("/api/owner/setup", {
        setupCode: process.env.OWNER_SETUP_SECRET,
        password: "owner passphrase 2026",
        passwordConfirm: "owner passphrase 2026",
        deviceLabel: "Mihail'in bilgisayarı",
      }),
    );

    expect(response.status).toBe(200);
    expect(setupCalls).toHaveLength(1);
    expect(setupCalls[0].passwordHash).not.toBe("owner passphrase 2026");
    expect(setupCalls[0].sessionTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.get("set-cookie")).toMatch(
      /sayyes_owner_session=sy_owner_[A-Za-z0-9_-]{43}/,
    );
  });

  test("rejects a wrong setup code without creating credentials", async () => {
    const response = await setup(
      jsonRequest("/api/owner/setup", {
        setupCode: "wrong setup code",
        password: "owner passphrase 2026",
        passwordConfirm: "owner passphrase 2026",
        deviceLabel: "Laptop",
      }),
    );

    expect(response.status).toBe(401);
    expect(setupCalls).toHaveLength(0);
  });

  test("creates a rolling database session only after password verification", async () => {
    credentials = { passwordHash: storedPasswordHash, passwordVersion: 4 };

    const response = await login(
      jsonRequest("/api/owner/login", {
        password: "owner passphrase 2026",
        deviceLabel: "Mihail'in bilgisayarı",
      }),
    );

    expect(response.status).toBe(200);
    expect(sessionCalls).toHaveLength(1);
    expect(sessionCalls[0]).toMatchObject({ passwordVersion: 4 });
    expect(sessionCalls[0].sessionTokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("does not create a session for a wrong owner password", async () => {
    credentials = { passwordHash: storedPasswordHash, passwordVersion: 1 };

    const response = await login(
      jsonRequest("/api/owner/login", {
        password: "wrong owner password",
        deviceLabel: "Laptop",
      }),
    );

    expect(response.status).toBe(401);
    expect(sessionCalls).toHaveLength(0);
  });

  test("renews a valid owner device session for another 90 days", async () => {
    credentials = { passwordHash: storedPasswordHash, passwordVersion: 2 };
    touchedSession = {
      id: "owner_sess_current",
      device_label: "Laptop",
      password_version: 2,
      expires_at: "2026-10-10T12:00:00.000Z",
    };

    const response = await session(
      new Request("https://memories.example/api/owner/session", {
        headers: { cookie: `sayyes_owner_session=${RAW_OWNER_SESSION}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: "authenticated",
      session: { id: "owner_sess_current", deviceLabel: "Laptop" },
    });
    expect(response.headers.get("set-cookie")).toContain(
      `sayyes_owner_session=${RAW_OWNER_SESSION}`,
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=7776000");
  });

  test("removes an invalid owner cookie instead of opening the cockpit", async () => {
    credentials = { passwordHash: storedPasswordHash, passwordVersion: 1 };
    touchedSession = null;

    const response = await session(
      new Request("https://memories.example/api/owner/session", {
        headers: { cookie: `sayyes_owner_session=${RAW_OWNER_SESSION}` },
      }),
    );

    expect(await response.json()).toEqual({ state: "login" });
    expect(response.headers.get("set-cookie")).toContain(
      "sayyes_owner_session=;",
    );
  });

  test("logout clears the browser cookie even when server revocation fails", async () => {
    credentials = { passwordHash: storedPasswordHash, passwordVersion: 1 };
    logoutShouldFail = true;

    const response = await logout(
      new Request("https://memories.example/api/owner/logout", {
        method: "POST",
        headers: { cookie: `sayyes_owner_session=${RAW_OWNER_SESSION}` },
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toContain(
      "sayyes_owner_session=;",
    );
  });
});
