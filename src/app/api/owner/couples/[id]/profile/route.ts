import { NextResponse } from "next/server";
import { validOwnerResourceId } from "@/lib/owner/actions";
import { setOwnerSessionCookie } from "@/lib/owner/cookies";
import { getOwnerWeddingProfilePath } from "@/lib/owner/data";
import { ownerError } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";
import { createSignedStorageUrl } from "@/lib/storage/storage-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!validOwnerResourceId(id)) return ownerError("INVALID_ID", 400);

  try {
    const path = await getOwnerWeddingProfilePath(id);
    if (!path) return ownerError("PROFILE_NOT_FOUND", 404);
    const response = NextResponse.redirect(await createSignedStorageUrl(path, 300));
    response.headers.set("Cache-Control", "private, max-age=240");
    setOwnerSessionCookie(response, auth.context.rawToken, request);
    return response;
  } catch {
    return ownerError("PROFILE_UNAVAILABLE", 503);
  }
}
