import { cookies } from "next/headers";
import {
  getCustomerSession,
  revokeCustomerSession,
} from "@/lib/auth/customer-store";
import { isSessionToken } from "@/lib/auth/session-tokens";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/security";

export function sessionCookieOptions(request?: Request) {
  const hostname = request ? new URL(request.url).hostname : "";
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && !isLocalhost,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  let revokeError: unknown;

  try {
    if (isSessionToken(rawToken)) {
      await revokeCustomerSession(rawToken);
    }
  } catch (error) {
    revokeError = error;
  } finally {
    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  if (revokeError) {
    throw revokeError;
  }
}

export async function getCurrentWeddingFromCookie() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!isSessionToken(rawToken)) {
    return null;
  }
  return getCustomerSession(rawToken);
}
