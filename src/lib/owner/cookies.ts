import type { NextResponse } from "next/server";

export const OWNER_COOKIE_NAME = "sayyes_owner_session";
export const LEGACY_OWNER_COOKIE_NAME = "sayyes_owner";
export const OWNER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function ownerCookieOptions(request?: Request) {
  const hostname = request ? new URL(request.url).hostname : "";
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && !isLocalhost,
    path: "/",
    maxAge: OWNER_SESSION_MAX_AGE_SECONDS,
  };
}

export function readRequestCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

export function setOwnerSessionCookie(
  response: NextResponse,
  rawToken: string,
  request?: Request,
) {
  response.cookies.set(OWNER_COOKIE_NAME, rawToken, ownerCookieOptions(request));
  response.cookies.delete(LEGACY_OWNER_COOKIE_NAME);
}

export function deleteOwnerSessionCookies(response: NextResponse) {
  response.cookies.delete(OWNER_COOKIE_NAME);
  response.cookies.delete(LEGACY_OWNER_COOKIE_NAME);
}
