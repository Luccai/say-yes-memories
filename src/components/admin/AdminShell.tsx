"use client";

import { useState, type ReactNode } from "react";
import {
  StudioNavigation,
  type AdminPanel,
} from "@/components/admin/StudioNavigation";
import { StudioHeader } from "@/components/admin/StudioHeader";
import type { Wedding } from "@/lib/types";

type AdminShellProps = {
  wedding: Wedding;
  presentationUrl: string;
  eventUrl: string;
  loggingOut: boolean;
  logoutError: string;
  memoriesPanel: (entrySequence: number) => ReactNode;
  weddingPagePanel: ReactNode;
  qrPanel: ReactNode;
  storagePanel: ReactNode;
  onHelp: () => void;
  onLogout: () => void;
};

export function AdminShell({
  wedding,
  presentationUrl,
  eventUrl,
  loggingOut,
  logoutError,
  memoriesPanel,
  weddingPagePanel,
  qrPanel,
  storagePanel,
  onHelp,
  onLogout,
}: AdminShellProps) {
  const [activePanel, setActivePanel] = useState<AdminPanel>("memories");
  const [memoriesEntrySequence, setMemoriesEntrySequence] = useState(0);

  function changePanel(panel: AdminPanel) {
    if (panel === "memories" && activePanel !== "memories") {
      setMemoriesEntrySequence((current) => current + 1);
    }
    setActivePanel(panel);
  }

  const activeSecondaryPanel =
    activePanel === "identity"
      ? weddingPagePanel
      : activePanel === "qr"
        ? qrPanel
        : activePanel === "storage"
          ? storagePanel
          : null;

  return (
    <main className="min-h-[100dvh] overflow-x-clip text-[var(--ink)]">
      <div className="mx-auto grid max-w-[96rem] min-w-0 gap-5 overflow-x-clip px-4 py-5 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:px-8">
        <StudioNavigation
          activePanel={activePanel}
          wedding={wedding}
          presentationUrl={presentationUrl}
          eventUrl={eventUrl}
          loggingOut={loggingOut}
          logoutError={logoutError}
          onPanelChange={changePanel}
          onHelp={onHelp}
          onLogout={onLogout}
        />

        <div className="min-w-0 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-0">
          <StudioHeader wedding={wedding} onHelp={onHelp} />

          <div className="grid">
            <section
              data-admin-panel="memories"
              data-panel-motion="enter-exit"
              aria-hidden={activePanel !== "memories"}
              className={`[grid-area:1/1] gap-5 ${
                activePanel === "memories" ? "grid" : "hidden"
              }`}
            >
              {memoriesPanel(memoriesEntrySequence)}
            </section>

            {activePanel !== "memories" ? (
              <section
                key={activePanel}
                data-admin-panel={activePanel}
                data-panel-motion="enter-exit"
                className="app-panel-enter [grid-area:1/1] grid gap-5"
              >
                {activeSecondaryPanel}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
