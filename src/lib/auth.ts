import { cookies } from "next/headers";
import {
  createSession,
  deleteSession,
  getSession,
  getWeddingById,
} from "@/lib/supabase-store";
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

export async function setSessionCookie(weddingId: string) {
  const session = await createSession(weddingId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session.id, sessionCookieOptions());
  return session;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  await deleteSession(sessionId);
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentWeddingFromCookie() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSession(sessionId);

  if (!session) {
    return null;
  }

  const wedding = await getWeddingById(session.weddingId);

  if (!wedding) {
    return null;
  }

  return { session, wedding };
}
