import { describe, expect, test } from "bun:test";
import { verifyTurnstile } from "@/lib/security/turnstile";

const secret = "turnstile-test-secret";

describe("Turnstile server verification", () => {
  test("sends the protected client IP and requires the upload action", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const result = await verifyTurnstile({
      token: "valid-token",
      request: new Request("https://memories.example/api/uploads/test", {
        headers: {
          "x-vercel-forwarded-for": "203.0.113.77",
          "x-forwarded-for": "198.51.100.20",
        },
      }),
      secretOverride: secret,
      expectedHostnamesOverride: ["memories.example"],
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({
          success: true,
          action: "guest-upload",
          hostname: "memories.example",
        });
      },
    });

    expect(result.success).toBeTrue();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      secret,
      response: "valid-token",
      remoteip: "203.0.113.77",
    });
    expect(bodies[0].idempotency_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("fails closed for a wrong action, hostname or rejected token", async () => {
    const base = {
      token: "token",
      request: new Request("https://memories.example/api/uploads/test"),
      secretOverride: secret,
      expectedHostnamesOverride: ["memories.example"],
    };

    await expect(
      verifyTurnstile({
        ...base,
        fetchImpl: async () =>
          Response.json({ success: true, action: "login", hostname: "memories.example" }),
      }),
    ).rejects.toThrow("Upload verification failed.");
    await expect(
      verifyTurnstile({
        ...base,
        fetchImpl: async () =>
          Response.json({ success: true, action: "guest-upload", hostname: "evil.example" }),
      }),
    ).rejects.toThrow("Upload verification failed.");
    await expect(
      verifyTurnstile({
        ...base,
        fetchImpl: async () =>
          Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] }),
      }),
    ).rejects.toThrow("Upload verification failed.");
  });
});
