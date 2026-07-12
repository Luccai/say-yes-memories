import { describe, expect, test } from "bun:test";
import { runWithConcurrency } from "@/lib/uploads/client";

describe("mobile multipart scheduling", () => {
  test("never runs more than three upload parts at once", async () => {
    let active = 0;
    let maximum = 0;
    const completed: number[] = [];

    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (part) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 3));
      completed.push(part);
      active -= 1;
    });

    expect(maximum).toBe(3);
    expect(completed.sort((left, right) => left - right)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});
