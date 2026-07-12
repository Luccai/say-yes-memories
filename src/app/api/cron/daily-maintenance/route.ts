import { timingSafeEqual } from "node:crypto";
import { runDailyMaintenance } from "@/lib/maintenance/daily";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (
    !secret ||
    Buffer.byteLength(secret, "utf8") < 32 ||
    receivedBuffer.length !== expectedBuffer.length
  ) {
    return false;
  }
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { ok: false, code: "UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const result = await runDailyMaintenance();
    return Response.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { ok: false, code: "MAINTENANCE_FAILED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
