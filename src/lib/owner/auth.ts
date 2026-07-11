import {
  OWNER_COOKIE_NAME,
  readRequestCookie,
} from "@/lib/owner/cookies";
import { isOwnerSessionToken } from "@/lib/owner/session-tokens";
import { touchOwnerSession } from "@/lib/owner/store";

export async function getOwnerRequestSession(request: Request) {
  const rawToken = readRequestCookie(request, OWNER_COOKIE_NAME);
  if (!isOwnerSessionToken(rawToken)) {
    return null;
  }

  const session = await touchOwnerSession(rawToken);
  return session ? { rawToken, session } : null;
}
