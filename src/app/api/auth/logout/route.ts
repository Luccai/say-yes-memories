import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/security";

export async function POST() {
  try {
    await clearSessionCookie();
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch {
    const response = NextResponse.json(
      { ok: false, code: "LOGOUT_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }
}
