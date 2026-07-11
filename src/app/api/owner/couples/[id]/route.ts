import {
  validOwnerResourceId,
  validateOwnerIdentityUpdate,
} from "@/lib/owner/actions";
import { getOwnerWeddingDetail } from "@/lib/owner/data";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { updateOwnerWeddingIdentity } from "@/lib/owner/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!validOwnerResourceId(id)) return ownerError("INVALID_ID", 400);
  try {
    const detail = await getOwnerWeddingDetail(id);
    return detail
      ? ownerJson(request, auth.context, detail)
      : ownerError("WEDDING_NOT_FOUND", 404);
  } catch {
    return ownerError("WEDDING_UNAVAILABLE", 503);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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
  const validated = validateOwnerIdentityUpdate(rawBody);
  if (!validated.ok) return ownerError(validated.code, 400);

  try {
    await updateOwnerWeddingIdentity({
      weddingId: id,
      ...validated.value,
      now: new Date().toISOString(),
    });
    const detail = await getOwnerWeddingDetail(id);
    return detail
      ? ownerJson(request, auth.context, detail)
      : ownerError("WEDDING_NOT_FOUND", 404);
  } catch {
    return ownerError("IDENTITY_UPDATE_FAILED", 503);
  }
}
