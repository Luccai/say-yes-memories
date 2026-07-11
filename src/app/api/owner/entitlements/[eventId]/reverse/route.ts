import {
  validOwnerResourceId,
  validateEntitlementReversal,
} from "@/lib/owner/actions";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { reverseOwnerEntitlement } from "@/lib/owner/store";

type RouteContext = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  const { eventId } = await context.params;
  if (!validOwnerResourceId(eventId)) return ownerError("INVALID_ID", 400);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return ownerError("INVALID_REQUEST", 400);
  }
  const validated = validateEntitlementReversal(rawBody);
  if (!validated.ok) return ownerError(validated.code, 400);

  try {
    await reverseOwnerEntitlement({
      eventId,
      operationKey: validated.value.operationKey,
      reason: validated.value.reason,
      now: new Date().toISOString(),
    });
    return ownerJson(request, auth.context, { ok: true });
  } catch {
    return ownerError("ENTITLEMENT_REVERSAL_FAILED", 503);
  }
}
