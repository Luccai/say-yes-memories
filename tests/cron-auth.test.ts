import { afterEach, describe, expect, test } from "bun:test";
import {
  GET,
  maxDuration,
} from "../src/app/api/cron/daily-maintenance/route";

const previousSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
});

describe("daily maintenance authorization", () => {
  test("reserves the Hobby-plan maximum execution window", () => {
    expect(maxDuration).toBe(300);
  });

  test("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(
      new Request("https://memories.example/api/cron/daily-maintenance"),
    );
    expect(response.status).toBe(401);
  });

  test("rejects a wrong bearer secret before maintenance runs", async () => {
    process.env.CRON_SECRET = "correct-secret-with-at-least-32-characters";
    const response = await GET(
      new Request("https://memories.example/api/cron/daily-maintenance", {
        headers: { Authorization: "Bearer wrong-secret" },
      }),
    );
    expect(response.status).toBe(401);
  });
});
