import { beforeEach, describe, expect, test } from "bun:test";

process.env.AUTH_RATE_LIMIT_SECRET =
  "rate-limit-test-secret-that-is-definitely-over-32-bytes";

const bucketCalls: Record<string, unknown>[] = [];
let identifierAllowed = true;

const operations = {
  consume: async (input: Record<string, unknown>) => {
    bucketCalls.push(input);
    const isIdentifier = String(input.action).endsWith(".identifier");
    return {
      allowed: isIdentifier ? identifierAllowed : true,
      retry_after_seconds: isIdentifier && !identifierAllowed ? 321 : 0,
      remaining_attempts: 3,
    };
  },
  clear: async () => undefined,
};

const { consumeCustomerAuthLimits, hashRateLimitKey } = await import(
  "../src/lib/auth/rate-limit"
);

beforeEach(() => {
  bucketCalls.length = 0;
  identifierAllowed = true;
});

describe("authentication rate limits", () => {
  test("stores only secret-keyed hashes, never raw IP or token values", async () => {
    const result = await consumeCustomerAuthLimits(
      new Request("https://example.test/api/auth/login", {
        headers: { "x-forwarded-for": "203.0.113.42, 10.0.0.1" },
      }),
      "login",
      "SYD-SECRET-TOKEN",
      operations,
    );

    expect(result.allowed).toBeTrue();
    expect(bucketCalls).toHaveLength(2);
    for (const call of bucketCalls) {
      expect(call.keyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(call)).not.toContain("203.0.113.42");
      expect(JSON.stringify(call)).not.toContain("SYD-SECRET-TOKEN");
    }
  });

  test("returns the database retry window when the identifier is blocked", async () => {
    identifierAllowed = false;
    const result = await consumeCustomerAuthLimits(
      new Request("https://example.test/api/auth/recover"),
      "recover",
      "token-hash",
      operations,
    );

    expect(result.allowed).toBeFalse();
    expect(result.retryAfterSeconds).toBe(321);
  });

  test("separates actions and scopes even for the same visible value", () => {
    expect(hashRateLimitKey("login", "ip", "same")).not.toBe(
      hashRateLimitKey("recover", "ip", "same"),
    );
    expect(hashRateLimitKey("login", "ip", "same")).not.toBe(
      hashRateLimitKey("login", "identifier", "same"),
    );
  });

  test("shares the account limit across different IP addresses", async () => {
    await consumeCustomerAuthLimits(
      new Request("https://example.test/api/auth/login", {
        headers: { "x-forwarded-for": "203.0.113.10" },
      }),
      "login",
      "fatma-mihail",
      operations,
    );
    const firstIpKey = bucketCalls[0].keyHash;
    const firstIdentifierKey = bucketCalls[1].keyHash;

    bucketCalls.length = 0;
    await consumeCustomerAuthLimits(
      new Request("https://example.test/api/auth/login", {
        headers: { "x-forwarded-for": "198.51.100.25" },
      }),
      "login",
      "fatma-mihail",
      operations,
    );

    expect(bucketCalls[0].keyHash).not.toBe(firstIpKey);
    expect(bucketCalls[1].keyHash).toBe(firstIdentifierKey);
  });

  test("prefers Vercel's protected client IP header", async () => {
    await consumeCustomerAuthLimits(
      new Request("https://example.test/api/auth/login", {
        headers: {
          "x-vercel-forwarded-for": "203.0.113.77",
          "x-forwarded-for": "198.51.100.200",
        },
      }),
      "login",
      "fatma-mihail",
      operations,
    );

    expect(bucketCalls[0].keyHash).toBe(
      hashRateLimitKey("login", "ip", "203.0.113.77"),
    );
  });
});
