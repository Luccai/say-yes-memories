import { describe, expect, test } from "bun:test";
import type { Wedding } from "@/lib/types";
import { requestProfileMediaRemoval } from "../src/components/admin/profile-photo-removal";

const wedding = {
  id: "wed_client_test",
  coupleName: "Alice & Bob",
} as Wedding;

describe("profile photo removal client", () => {
  test("sends DELETE and returns the refreshed wedding", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const result = await requestProfileMediaRemoval(async (input, init) => {
      calls.push({ input, init });
      return Response.json({ wedding });
    });

    expect(calls).toEqual([
      {
        input: "/api/weddings/current/profile-media",
        init: { method: "DELETE" },
      },
    ]);
    expect(result).toEqual(wedding);
  });

  test("preserves the server message for localized UI error handling", async () => {
    expect(
      requestProfileMediaRemoval(async () =>
        Response.json(
          { message: "Profile photo could not be removed." },
          { status: 409 },
        ),
      ),
    ).rejects.toThrow("Profile photo could not be removed.");
  });

  test("uses a stable fallback when a successful response has no wedding", async () => {
    expect(
      requestProfileMediaRemoval(async () => Response.json({})),
    ).rejects.toThrow("Profile photo could not be removed.");
  });
});
