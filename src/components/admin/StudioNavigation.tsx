"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  CircleHelp,
  ExternalLink,
  HardDrive,
  Image as ImageIcon,
  LogOut,
  Menu,
  MonitorPlay,
  QrCode,
  Settings2,
  X,
} from "lucide-react";
import { Button } from "@/components/shared/Button";
import { MediaOrb } from "@/components/shared/MediaOrb";
import { useCopy } from "@/lib/i18n-client";
import type { Wedding } from "@/lib/types";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

export type AdminPanel = "memories" | "storage" | "identity" | "qr";

type StudioNavigationProps = {
  activePanel: AdminPanel;
  wedding: Pick<Wedding, "coupleName" | "profileMedia">;
  presentationUrl: string;
  eventUrl: string;
  loggingOut: boolean;
  logoutError: string;
  onPanelChange: (panel: AdminPanel) => void;
  onHelp: () => void;
  onLogout: () => void;
};

type NavigationItem =
  | {
      kind: "panel";
      panel: AdminPanel;
      label: string;
      mobileLabel: string;
      icon: ComponentType<{ className?: string }>;
    }
  | {
      kind: "link";
      href: string;
      label: string;
      mobileLabel: string;
      icon: ComponentType<{ className?: string }>;
      newTab?: boolean;
    };

const mobileNavigationLabelClass =
  "max-w-full truncate text-center text-[0.6rem] font-extrabold leading-none tracking-[-0.04em] max-[374px]:text-[0.54rem]";

function mobileNavigationControlClass(active: boolean) {
  return `focus-ring flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0 font-black transition motion-safe:active:scale-[0.96] ${
    active
      ? "text-[var(--ink)]"
      : "text-[var(--ink-soft)] hover:bg-white/36 hover:text-[var(--ink)]"
  }`;
}

const logoutButtonClass =
  "justify-start px-4 !text-red-600 hover:bg-red-50 hover:!text-red-700";

export function StudioNavigation({
  activePanel,
  wedding,
  presentationUrl,
  eventUrl,
  loggingOut,
  logoutError,
  onPanelChange,
  onHelp,
  onLogout,
}: StudioNavigationProps) {
  const copy = useCopy();
  const text = copy.admin;
  const close = copy.close;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreDialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const primaryItems: NavigationItem[] = [
    {
      kind: "panel",
      panel: "memories",
      label: text.memories,
      mobileLabel: text.mobileMemories,
      icon: ImageIcon,
    },
    {
      kind: "link",
      href: presentationUrl,
      label: text.presentation,
      mobileLabel: text.mobilePresentation,
      icon: MonitorPlay,
    },
    {
      kind: "panel",
      panel: "identity",
      label: text.weddingPage,
      mobileLabel: text.mobileWeddingPage,
      icon: Settings2,
    },
    {
      kind: "panel",
      panel: "qr",
      label: text.qrAndLink,
      mobileLabel: text.mobileQrAndLink,
      icon: QrCode,
    },
  ];

  useBodyScrollLock(moreOpen);
  useAccessibleDialog({
    open: moreOpen,
    containerRef: moreDialogRef,
    initialFocusRef: closeButtonRef,
    onClose: () => setMoreOpen(false),
  });

  useEffect(() => {
    const desktopBreakpoint = window.matchMedia("(min-width: 1024px)");
    const closeMoreOnDesktop = () => {
      if (desktopBreakpoint.matches) {
        setMoreOpen(false);
      }
    };

    closeMoreOnDesktop();
    desktopBreakpoint.addEventListener("change", closeMoreOnDesktop);

    return () => {
      desktopBreakpoint.removeEventListener("change", closeMoreOnDesktop);
    };
  }, []);

  const selectPanel = (panel: AdminPanel) => {
    setMoreOpen(false);
    onPanelChange(panel);
  };

  const openHelp = () => {
    setMoreOpen(false);
    onHelp();
  };

  return (
    <>
      <aside className="hidden lg:sticky lg:top-6 lg:flex lg:h-[calc(100dvh-3rem)] lg:min-h-[38rem] lg:flex-col lg:rounded-[34px] lg:border lg:border-white/75 lg:bg-[rgba(255,250,243,0.8)] lg:p-4 lg:shadow-[var(--shadow-soft)] lg:backdrop-blur-xl">
        <div
          data-studio-identity="desktop"
          className="flex items-center gap-3 border-b border-[var(--line)] px-2 pb-4 pt-1"
        >
          <MediaOrb
            media={wedding.profileMedia}
            label={wedding.coupleName}
            priority={false}
            className="h-[4.25rem] w-[3.4rem] shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.64rem] font-black uppercase tracking-[0.2em] text-[var(--champagne-deep)]">
              {text.studioGroup}
            </p>
            <h1 className="mt-1 truncate font-serif text-xl font-bold text-[var(--ink)]">
              {wedding.coupleName}
            </h1>
          </div>
        </div>

        <nav
          data-studio-navigation="desktop"
          aria-label={text.navigation}
          className="mt-4 flex min-h-0 flex-1 flex-col"
        >
          <div className="grid gap-1.5">
            {primaryItems.map((item) => (
              <NavigationControl
                key={item.kind === "panel" ? item.panel : item.href}
                item={item}
                mode="desktop"
                active={item.kind === "panel" && activePanel === item.panel}
                onPanelChange={selectPanel}
              />
            ))}
          </div>

          <div className="my-4 border-t border-[var(--line)]" />
          <p className="px-3 text-[0.62rem] font-black uppercase tracking-[0.2em] text-[var(--champagne-deep)]">
            {text.more}
          </p>
          <div className="mt-2 grid gap-1.5">
            <SecondaryAction
              icon={HardDrive}
              label={text.storageNav}
              active={activePanel === "storage"}
              onClick={() => selectPanel("storage")}
            />
            <SecondaryLink
              href={eventUrl}
              icon={ExternalLink}
              label={text.openPage}
            />
          </div>

          <div className="mt-auto grid gap-1.5 pt-4">
            <SecondaryAction
              icon={CircleHelp}
              label={copy.help}
              onClick={openHelp}
            />
            <Button
              onClick={onLogout}
              disabled={loggingOut}
              loading={loggingOut}
              variant="quiet"
              fullWidth
              className={logoutButtonClass}
            >
              <LogOut className="size-4" />
              {text.logout}
            </Button>
            {logoutError ? (
              <p role="alert" className="mt-2 px-2 text-xs font-semibold text-[var(--rosewood)]">
                {logoutError}
              </p>
            ) : null}
          </div>
        </nav>
      </aside>

      <nav
        data-studio-navigation="mobile"
        data-mobile-navigation-style="c"
        aria-label={text.navigation}
        className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[70] grid w-[min(calc(100vw-0.5rem),32rem)] -translate-x-1/2 grid-cols-5 rounded-[28px] border border-white/80 bg-[rgba(255,250,243,0.9)] px-2 py-1.5 shadow-none backdrop-blur-xl lg:hidden"
      >
        {primaryItems.map((item) => (
          <NavigationControl
            key={item.kind === "panel" ? item.panel : item.href}
            item={item}
            mode="mobile"
            active={item.kind === "panel" && activePanel === item.panel}
            onPanelChange={selectPanel}
          />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-current={activePanel === "storage" ? "page" : undefined}
          className={mobileNavigationControlClass(activePanel === "storage")}
        >
          <Menu className="size-5" />
          <span className={mobileNavigationLabelClass}>
            {text.more}
          </span>
        </button>
      </nav>

      {moreOpen ? (
        <div data-mobile-more-layer="true" className="fixed inset-0 z-[75] lg:hidden">
          <button
            type="button"
            aria-label={close}
            data-mobile-more-backdrop="true"
            className="absolute inset-0 bg-[rgba(31,23,18,0.22)] backdrop-blur-[2px]"
            onClick={() => setMoreOpen(false)}
          />
          <div
            ref={moreDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={text.more}
            tabIndex={-1}
            data-scroll-lock-allow="true"
            className="modal-shell absolute bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.25rem)] left-1/2 max-h-[calc(100dvh-6.25rem-env(safe-area-inset-bottom))] w-[min(calc(100vw-1rem),32rem)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-[30px] border border-white/80 bg-[rgba(255,250,243,0.96)] p-3 shadow-[0_24px_70px_rgba(58,40,25,0.24)] backdrop-blur-xl"
          >
              <div className="mb-2 flex items-center justify-between px-2 py-1">
                <p className="font-serif text-2xl font-bold text-[var(--ink)]">{text.more}</p>
                <Button
                  ref={closeButtonRef}
                  onClick={() => setMoreOpen(false)}
                  variant="paper"
                  size="icon"
                  aria-label={close}
                  className="!size-11 !min-h-11"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="grid gap-2">
                <SecondaryAction
                  icon={HardDrive}
                  label={text.storageNav}
                  active={activePanel === "storage"}
                  onClick={() => selectPanel("storage")}
                />
                <SecondaryLink
                  href={eventUrl}
                  icon={ExternalLink}
                  label={text.openPage}
                />
                <Button
                  onClick={onLogout}
                  disabled={loggingOut}
                  loading={loggingOut}
                  variant="quiet"
                  fullWidth
                  className={logoutButtonClass}
                >
                  <LogOut className="size-4" />
                  {text.logout}
                </Button>
                {logoutError ? (
                  <p role="alert" className="px-2 text-xs font-semibold text-[var(--rosewood)]">
                    {logoutError}
                  </p>
                ) : null}
              </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function NavigationControl({
  item,
  mode,
  active,
  onPanelChange,
}: {
  item: NavigationItem;
  mode: "mobile" | "desktop";
  active: boolean;
  onPanelChange: (panel: AdminPanel) => void;
}) {
  const Icon = item.icon;
  const className =
    mode === "mobile"
      ? mobileNavigationControlClass(active)
      : `focus-ring flex min-h-12 w-full items-center gap-3 rounded-full px-3 text-left text-sm font-extrabold transition motion-safe:active:scale-[0.985] ${
          active
            ? "bg-[var(--ink)] text-[var(--paper-soft)] shadow-[0_10px_24px_rgba(31,23,18,0.16)]"
            : "text-[var(--ink-soft)] hover:bg-white/64 hover:text-[var(--ink)]"
        }`;
  const content = (
    <>
      <span className={mode === "desktop" ? "grid size-8 shrink-0 place-items-center rounded-full bg-white/10" : undefined}>
        <Icon className={mode === "desktop" ? "size-4" : "size-[1.15rem]"} />
      </span>
      <span
        className={
          mode === "mobile"
            ? mobileNavigationLabelClass
            : "truncate font-extrabold"
        }
      >
        {mode === "mobile" ? item.mobileLabel : item.label}
      </span>
    </>
  );

  if (item.kind === "link") {
    if (!item.newTab) {
      return (
        <Link
          href={item.href}
          prefetch={false}
          aria-label={
            mode === "mobile" ? `${item.mobileLabel}: ${item.label}` : undefined
          }
          className={className}
        >
          {content}
        </Link>
      );
    }

    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        aria-label={
          mode === "mobile" ? `${item.mobileLabel}: ${item.label}` : undefined
        }
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPanelChange(item.panel)}
      aria-current={active ? "page" : undefined}
      aria-label={
        mode === "mobile" ? `${item.mobileLabel}: ${item.label}` : undefined
      }
      className={className}
    >
      {content}
    </button>
  );
}

function SecondaryAction({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`focus-ring flex min-h-12 w-full items-center gap-3 rounded-full border px-4 text-left text-sm font-extrabold transition motion-safe:active:scale-[0.985] ${
        active
          ? "border-[rgba(139,107,63,0.32)] bg-[rgba(239,222,193,0.68)] text-[var(--ink)]"
          : "border-transparent bg-white/38 text-[var(--ink-soft)] hover:border-[var(--line)] hover:bg-white/68 hover:text-[var(--ink)]"
      }`}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate font-extrabold">{label}</span>
    </button>
  );
}

function SecondaryLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring flex min-h-12 w-full items-center gap-3 rounded-full border border-transparent bg-white/38 px-4 text-left text-sm font-extrabold text-[var(--ink-soft)] transition hover:border-[var(--line)] hover:bg-white/68 hover:text-[var(--ink)] motion-safe:active:scale-[0.985]"
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-extrabold">{label}</span>
      <ExternalLink className="size-3.5 shrink-0 opacity-60" />
    </a>
  );
}
