import { validOwnerResourceId, validateCleanupApproval } from "@/lib/owner/actions";
import { getOwnerWeddingDetail } from "@/lib/owner/data";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { approveOwnerCleanup } from "@/lib/owner/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!validOwnerResourceId(id)) return ownerError("INVALID_ID", 400);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return ownerError("INVALID_REQUEST", 400);
  }

  try {
    const detail = await getOwnerWeddingDetail(id);
    if (!detail) return ownerError("WEDDING_NOT_FOUND", 404);
    const validated = validateCleanupApproval(rawBody, detail.wedding.slug);
    if (!validated.ok) return ownerError(validated.code, 400);

    const result = await approveOwnerCleanup({
      actorSessionId: auth.context.session.id,
      weddingId: id,
      operationKey: validated.value.operationKey,
      now: new Date().toISOString(),
    });
    return ownerJson(request, auth.context, result);
  } catch {
    return ownerError("CLEANUP_APPROVAL_FAILED", 503);
  }
}
