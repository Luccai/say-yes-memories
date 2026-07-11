import { getOwnerRequestSession } from "@/lib/owner/auth";
import { ownerError, ownerUnauthorized } from "@/lib/owner/responses";

export async function authenticateOwnerRoute(request: Request) {
  try {
    const context = await getOwnerRequestSession(request);
    if (!context) {
      return { ok: false as const, response: ownerUnauthorized() };
    }
    return { ok: true as const, context };
  } catch {
    return {
      ok: false as const,
      response: ownerError("OWNER_SESSION_UNAVAILABLE", 503),
    };
  }
}
