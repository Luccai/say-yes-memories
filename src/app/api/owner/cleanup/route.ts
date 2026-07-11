import { listOwnerCleanupCandidates } from "@/lib/owner/data";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";

export async function GET(request: Request) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  try {
    return ownerJson(request, auth.context, {
      weddings: await listOwnerCleanupCandidates(),
    });
  } catch {
    return ownerError("CLEANUP_UNAVAILABLE", 503);
  }
}
