import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { code: "LEGACY_STUDIO_CODE_FLOW_REMOVED" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
