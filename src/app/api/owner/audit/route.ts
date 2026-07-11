import { listOwnerAudit } from "@/lib/owner/data";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";

export async function GET(request: Request) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  try {
    return ownerJson(request, auth.context, {
      audit: await listOwnerAudit(),
    });
  } catch {
    return ownerError("AUDIT_UNAVAILABLE", 503);
  }
}
