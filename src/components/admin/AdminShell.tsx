"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  const reduceMotion = useReducedMotion();

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
            <motion.section
              data-admin-panel="memories"
              data-panel-motion="enter-exit"
              aria-hidden={activePanel !== "memories"}
              initial={false}
              animate={
                activePanel === "memories"
                  ? { display: "grid", opacity: 1, y: 0 }
                  : { opacity: 0, y: 8, transitionEnd: { display: "none" } }
              }
              transition={{
                duration: reduceMotion ? 0 : 0.24,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="[grid-area:1/1] grid gap-5"
            >
              {memoriesPanel(memoriesEntrySequence)}
            </motion.section>

            <AnimatePresence mode="wait" initial={false}>
              {activePanel !== "memories" ? (
                <motion.section
                  key={activePanel}
                  data-admin-panel={activePanel}
                  data-panel-motion="enter-exit"
                  initial={
                    reduceMotion ? false : { opacity: 0, y: 14, scale: 0.992 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    reduceMotion
                      ? undefined
                      : { opacity: 0, y: -6, scale: 0.996 }
                  }
                  transition={{
                    duration: reduceMotion ? 0 : 0.24,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="[grid-area:1/1] grid gap-5"
                >
                  {activeSecondaryPanel}
                </motion.section>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </main>
  );
}
