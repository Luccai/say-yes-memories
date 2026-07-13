"use client";

import { useEffect } from "react";

type BodyLockSnapshot = {
  scrollY: number;
  bodyOverflow: string;
  bodyOverscrollBehavior: string;
  bodyPaddingRight: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
};

let lockCount = 0;
let activeLock: BodyLockSnapshot | null = null;
let restoreTimer: number | null = null;
let touchStartY = 0;

function scrollLockAllowedElement(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>("[data-scroll-lock-allow='true']");
}

function canScroll(element: HTMLElement, deltaY: number) {
  const maxScrollTop = element.scrollHeight - element.clientHeight;

  if (maxScrollTop <= 0) {
    return false;
  }

  if (deltaY < 0) {
    return element.scrollTop > 0;
  }

  if (deltaY > 0) {
    return element.scrollTop < maxScrollTop;
  }

  return true;
}

function preventBackgroundWheel(event: WheelEvent) {
  const allowedElement = scrollLockAllowedElement(event.target);

  if (allowedElement && canScroll(allowedElement, event.deltaY)) {
    return;
  }

  event.preventDefault();
}

function recordTouchStart(event: TouchEvent) {
  touchStartY = event.touches[0]?.clientY ?? 0;
}

function preventBackgroundTouchMove(event: TouchEvent) {
  const currentY = event.touches[0]?.clientY ?? touchStartY;
  const deltaY = touchStartY - currentY;
  const allowedElement = scrollLockAllowedElement(event.target);

  if (allowedElement && canScroll(allowedElement, deltaY)) {
    touchStartY = currentY;
    return;
  }

  event.preventDefault();
}

function applyBodyScrollLock() {
  if (restoreTimer !== null) {
    window.clearTimeout(restoreTimer);
    restoreTimer = null;
  }

  if (activeLock) {
    return;
  }

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  activeLock = {
    scrollY: window.scrollY,
    bodyOverflow: document.body.style.overflow,
    bodyOverscrollBehavior: document.body.style.overscrollBehavior,
    bodyPaddingRight: document.body.style.paddingRight,
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    bodyLeft: document.body.style.left,
    bodyRight: document.body.style.right,
    bodyWidth: document.body.style.width,
  };

  document.body.style.overflow = "hidden";
  document.body.style.overscrollBehavior = "none";

  // Keep the document at its real scroll offset. Restoring a fixed body makes
  // mobile browsers briefly paint the page from the top before scrolling back.
  // The wheel and touch guards below still keep the background from moving.

  if (scrollbarWidth > 0) {
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }

  document.addEventListener("wheel", preventBackgroundWheel, { passive: false });
  document.addEventListener("touchstart", recordTouchStart, { passive: true });
  document.addEventListener("touchmove", preventBackgroundTouchMove, { passive: false });
}

function restoreBodyScrollLock() {
  restoreTimer = null;

  if (lockCount > 0 || !activeLock) {
    return;
  }

  document.removeEventListener("wheel", preventBackgroundWheel);
  document.removeEventListener("touchstart", recordTouchStart);
  document.removeEventListener("touchmove", preventBackgroundTouchMove);
  document.body.style.overflow = activeLock.bodyOverflow;
  document.body.style.overscrollBehavior = activeLock.bodyOverscrollBehavior;
  document.body.style.paddingRight = activeLock.bodyPaddingRight;
  document.body.style.position = activeLock.bodyPosition;
  document.body.style.top = activeLock.bodyTop;
  document.body.style.left = activeLock.bodyLeft;
  document.body.style.right = activeLock.bodyRight;
  document.body.style.width = activeLock.bodyWidth;
  activeLock = null;
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) {
      return;
    }

    lockCount += 1;
    applyBodyScrollLock();

    return () => {
      lockCount = Math.max(0, lockCount - 1);

      if (lockCount === 0) {
        restoreTimer = window.setTimeout(restoreBodyScrollLock, 0);
      }
    };
  }, [locked]);
}
