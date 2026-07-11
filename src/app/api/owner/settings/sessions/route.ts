import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { listOwnerSessions } from "@/lib/owner/store";

export async function GET(request: Request) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  try {
    return ownerJson(request, auth.context, {
      currentSessionId: auth.context.session.id,
      sessions: await listOwnerSessions(),
    });
  } catch {
    return ownerError("OWNER_DEVICES_UNAVAILABLE", 503);
  }
}
