import { beforeEach, describe, expect, test } from "bun:test";

process.env.AUTH_RATE_LIMIT_SECRET =
  "owner-rate-limit-test-secret-that-is-over-32-bytes";

const bucketCalls: Record<string, unknown>[] = [];
let blockGlobal = false;

const operations = {
  consume: async (input: Record<string, unknown>) => {
    bucketCalls.push(input);
    const globalBucket = String(input.action).endsWith(".global");
    return {
      allowed: !(globalBucket && blockGlobal),
      retry_after_seconds: globalBucket && blockGlobal ? 420 : 0,
      remaining_attempts: 3,
    };
  },
  clear: async () => undefined,
};

const { consumeOwnerAuthLimitPolicy } = await import(
  "../src/lib/owner/rate-limit-policy"
);

beforeEach(() => {
  bucketCalls.length = 0;
  blockGlobal = false;
});

describe("owner authentication rate limits", () => {
  test("combines a per-IP bucket with one global owner-account bucket", async () => {
    await consumeOwnerAuthLimitPolicy(
      new Request("https://example.test/api/owner/login", {
        headers: { "x-vercel-forwarded-for": "203.0.113.10" },
      }),
      "login",
      operations,
    );
    const firstIpKey = bucketCalls[0].keyHash;
    const firstGlobalKey = bucketCalls[1].keyHash;

    bucketCalls.length = 0;
    await consumeOwnerAuthLimitPolicy(
      new Request("https://example.test/api/owner/login", {
        headers: { "x-vercel-forwarded-for": "198.51.100.25" },
      }),
      "login",
      operations,
    );

    expect(bucketCalls).toHaveLength(2);
    expect(bucketCalls[0].keyHash).not.toBe(firstIpKey);
    expect(bucketCalls[1].keyHash).toBe(firstGlobalKey);
    expect(JSON.stringify(bucketCalls)).not.toContain("198.51.100.25");
  });

  test("blocks distributed attempts when the global owner bucket is exhausted", async () => {
    blockGlobal = true;
    const result = await consumeOwnerAuthLimitPolicy(
      new Request("https://example.test/api/owner/login"),
      "login",
      operations,
    );

    expect(result.allowed).toBeFalse();
    expect(result.retryAfterSeconds).toBe(420);
  });
});
