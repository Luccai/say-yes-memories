"use client";

import { HelpCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/shared/Button";

export function GuidanceTriggerButton({
  label,
  onClick,
  icon: Icon,
  mobileIconOnly = false,
  iconOnly = false,
}: {
  label: string;
  onClick: () => void;
  icon: LucideIcon;
  mobileIconOnly?: boolean;
  iconOnly?: boolean;
}) {
  const widthClass = iconOnly
    ? "size-12 px-0"
    : mobileIconOnly
      ? "size-12 px-0 sm:h-auto sm:w-auto sm:px-4"
      : "";

  return (
    <Button
      onClick={onClick}
      aria-label={label}
      variant="paper"
      size="compact"
      className={widthClass + " shrink-0"}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[rgba(255,250,243,0.76)] text-[var(--champagne-deep)]">
        <Icon className="size-3.5" />
      </span>
      <span className={iconOnly ? "sr-only" : mobileIconOnly ? "hidden sm:inline" : undefined}>
        {label}
      </span>
    </Button>
  );
}

export function HelpTriggerButton(
  props: Omit<Parameters<typeof GuidanceTriggerButton>[0], "icon">,
) {
  return <GuidanceTriggerButton {...props} icon={HelpCircle} />;
}
