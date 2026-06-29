import { NextResponse } from "next/server";
import { isOwnerAuthenticated } from "@/lib/owner-auth";
import { applyPremiumExtension } from "@/lib/supabase-store";

function ownerUpgradeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Premium Extension tanımlanamadı.";
  }

  if (error.message.includes("Studio code was not found")) {
    return "Bu Studio Code ile galeri bulunamadı.";
  }

  if (error.message.includes("Etsy order number is required")) {
    return "Etsy sipariş no zorunlu.";
  }

  if (error.message.includes("This Etsy order number was already applied")) {
    return "Bu Etsy sipariş no daha önce kullanılmış.";
  }

  return error.message || "Premium Extension tanımlanamadı.";
}

export async function POST(request: Request) {
  const redirectUrl = new URL("/owner/upgrades", request.url);

  if (!(await isOwnerAuthenticated())) {
    redirectUrl.searchParams.set("error", "Owner oturumu gerekli.");
    return NextResponse.redirect(redirectUrl, 303);
  }

  const formData = await request.formData();
  const studioCode = String(formData.get("studioCode") ?? "").trim().toUpperCase();
  const etsyOrderNumber = String(formData.get("etsyOrderNumber") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  redirectUrl.searchParams.set("studioCode", studioCode);

  try {
    await applyPremiumExtension({
      studioCode,
      etsyOrderNumber,
      note: note || undefined,
    });
    redirectUrl.searchParams.set("applied", "1");
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      ownerUpgradeErrorMessage(error),
    );
  }

  return NextResponse.redirect(redirectUrl, 303);
}
