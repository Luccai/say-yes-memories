import { NextResponse } from "next/server";
import {
  deleteOwnerSessionCookies,
  OWNER_COOKIE_NAME,
  readRequestCookie,
  setOwnerSessionCookie,
} from "@/lib/owner/cookies";
import { isOwnerSessionToken } from "@/lib/owner/session-tokens";
import { getOwnerCredentials, touchOwnerSession } from "@/lib/owner/store";

export async function GET(request: Request) {
  try {
    const credentials = await getOwnerCredentials();
    if (!credentials) {
      const response = NextResponse.json(
        { state: "setup" },
        { headers: { "Cache-Control": "no-store" } },
      );
      deleteOwnerSessionCookies(response);
      return response;
    }

    const rawToken = readRequestCookie(request, OWNER_COOKIE_NAME);
    if (!isOwnerSessionToken(rawToken)) {
      const response = NextResponse.json(
        { state: "login" },
        { headers: { "Cache-Control": "no-store" } },
      );
      deleteOwnerSessionCookies(response);
      return response;
    }

    const session = await touchOwnerSession(rawToken);
    if (!session) {
      const response = NextResponse.json(
        { state: "login" },
        { headers: { "Cache-Control": "no-store" } },
      );
      deleteOwnerSessionCookies(response);
      return response;
    }

    const response = NextResponse.json(
      {
        state: "authenticated",
        session: {
          id: session.id,
          deviceLabel: session.device_label,
          passwordVersion: session.password_version,
          lastSeenAt: session.last_seen_at,
          expiresAt: session.expires_at,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    setOwnerSessionCookie(response, rawToken, request);
    return response;
  } catch {
    return NextResponse.json(
      { state: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
