"use client";

import { HelpTriggerButton } from "@/components/shared/GuidanceDialog";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { useCopy } from "@/lib/i18n-client";
import type { Wedding } from "@/lib/types";

type StudioHeaderProps = {
  wedding: Pick<Wedding, "coupleName" | "profileMedia">;
  onHelp: () => void;
};

export function StudioHeader({ wedding, onHelp }: StudioHeaderProps) {
  const copy = useCopy();

  return (
    <header
      data-studio-identity="mobile"
      className="paper-grain mb-5 overflow-hidden rounded-[34px] border border-white/75 bg-[rgba(255,250,243,0.78)] p-5 shadow-none backdrop-blur-xl sm:p-7 sm:shadow-[var(--shadow-soft)] lg:hidden"
    >
      <div className="relative z-20 flex items-center gap-4 sm:gap-5">
        <MediaOrb
          media={wedding.profileMedia}
          label={wedding.coupleName}
          className="h-[4.5rem] w-[3.5rem] shrink-0 sm:h-24 sm:w-20"
        />
        <div className="relative min-w-0 flex-1 pr-12 [container-type:inline-size]">
          <h1 className="couple-name text-[var(--ink)]">{wedding.coupleName}</h1>
          <div className="absolute right-0 top-0">
            <HelpTriggerButton label={copy.help} onClick={onHelp} iconOnly />
          </div>
        </div>
      </div>
    </header>
  );
}
