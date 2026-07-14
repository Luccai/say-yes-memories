export type PremiumPurchaseAction =
  | { kind: "demo" }
  | { kind: "link"; href: string }
  | { kind: "unavailable" };

export function resolvePremiumPurchaseAction({
  demoMode,
  upgradeUrl,
}: {
  demoMode: boolean;
  upgradeUrl?: string;
}): PremiumPurchaseAction {
  if (demoMode) {
    return { kind: "demo" };
  }

  if (upgradeUrl) {
    return { kind: "link", href: upgradeUrl };
  }

  return { kind: "unavailable" };
}
