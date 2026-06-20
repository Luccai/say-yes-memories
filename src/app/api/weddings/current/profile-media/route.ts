import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Use /prepare and /complete for signed uploads." },
    { status: 410 },
  );
}
