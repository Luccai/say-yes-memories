import { NextResponse } from "next/server";
import {
  deleteOwnerSessionCookies,
  OWNER_COOKIE_NAME,
  readRequestCookie,
} from "@/lib/owner/cookies";
import { isOwnerSessionToken } from "@/lib/owner/session-tokens";
import { logoutOwnerSession } from "@/lib/owner/store";

export async function POST(request: Request) {
  const rawToken = readRequestCookie(request, OWNER_COOKIE_NAME);
  let revokeFailed = false;

  try {
    if (isOwnerSessionToken(rawToken)) {
      await logoutOwnerSession(rawToken);
    }
  } catch {
    revokeFailed = true;
  }

  const response = NextResponse.json(
    revokeFailed
      ? { ok: false, code: "LOGOUT_UNAVAILABLE" }
      : { ok: true },
    {
      status: revokeFailed ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
  deleteOwnerSessionCookies(response);
  return response;
}
