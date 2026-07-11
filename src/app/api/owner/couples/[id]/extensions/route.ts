import {
  validOwnerResourceId,
  validateExtensionApply,
} from "@/lib/owner/actions";
import { getOwnerWeddingDetail } from "@/lib/owner/data";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { applyOwnerPremiumExtension } from "@/lib/owner/store";

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
  const validated = validateExtensionApply(rawBody);
  if (!validated.ok) return ownerError(validated.code, 400);

  try {
    await applyOwnerPremiumExtension({
      weddingId: id,
      operationKey: validated.value.operationKey,
      note: validated.value.note,
      now: new Date().toISOString(),
    });
    return ownerJson(request, auth.context, await getOwnerWeddingDetail(id));
  } catch {
    return ownerError("EXTENSION_APPLY_FAILED", 503);
  }
}
