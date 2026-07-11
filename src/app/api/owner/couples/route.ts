import { listOwnerWeddings } from "@/lib/owner/data";
import { ownerError, ownerJson } from "@/lib/owner/responses";
import { authenticateOwnerRoute } from "@/lib/owner/route-auth";

export async function GET(request: Request) {
  const auth = await authenticateOwnerRoute(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  try {
    return ownerJson(
      request,
      auth.context,
      await listOwnerWeddings({
        search: url.searchParams.get("q") ?? "",
        limit: Number(url.searchParams.get("limit") ?? 50),
        offset: Number(url.searchParams.get("offset") ?? 0),
      }),
    );
  } catch {
    return ownerError("COUPLES_UNAVAILABLE", 503);
  }
}
