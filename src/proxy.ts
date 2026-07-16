import { NextRequest, NextResponse } from "next/server";
import { isTrustedMutationRequest } from "@/lib/security/same-origin";

export function proxy(request: NextRequest) {
  if (!isTrustedMutationRequest(request)) {
    return NextResponse.json(
      { message: "Cross-origin requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
