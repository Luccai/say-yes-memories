"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type DialogKeyboardIntent =
  | "close"
  | "trap-forward"
  | "trap-backward";

export function dialogKeyboardIntent(
  key: string,
  shiftKey: boolean,
): DialogKeyboardIntent | null {
  if (key === "Escape") return "close";
  if (key === "Tab") return shiftKey ? "trap-backward" : "trap-forward";
  return null;
}

export function resolveFocusTrapTarget<T>(
  focusable: readonly T[],
  active: T | null,
  backwards: boolean,
): T | null {
  if (focusable.length === 0) return null;

  const activeIndex = active === null ? -1 : focusable.indexOf(active);
  if (backwards) {
    return activeIndex <= 0 ? (focusable.at(-1) ?? null) : null;
  }

  return activeIndex === -1 || activeIndex === focusable.length - 1
    ? (focusable[0] ?? null)
    : null;
}

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    if (
      element.hidden ||
      element.getAttribute("aria-hidden") === "true" ||
      element.closest("[inert]")
    ) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function focusWithoutScroll(element: HTMLElement) {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

export function useAccessibleDialog({
  open,
  containerRef,
  initialFocusRef,
  onClose,
}: {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    let active = true;

    queueMicrotask(() => {
      if (!active || !container.isConnected) return;
      const firstControl = focusableElements(container)[0];
      focusWithoutScroll(initialFocusRef?.current ?? firstControl ?? container);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      const intent = dialogKeyboardIntent(event.key, event.shiftKey);
      if (!intent) return;

      if (intent === "close") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      const controls = focusableElements(container);
      if (controls.length === 0) {
        event.preventDefault();
        focusWithoutScroll(container);
        return;
      }

      const focused =
        document.activeElement instanceof HTMLElement &&
        container.contains(document.activeElement)
          ? document.activeElement
          : null;
      const target = resolveFocusTrapTarget(
        controls,
        focused,
        intent === "trap-backward",
      );

      if (target) {
        event.preventDefault();
        focusWithoutScroll(target);
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      active = false;
      document.removeEventListener("keydown", onKeyDown, true);

      if (previouslyFocused?.isConnected) {
        focusWithoutScroll(previouslyFocused);
      }
    };
  }, [containerRef, initialFocusRef, open]);
}
