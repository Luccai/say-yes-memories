"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

const SCRIPT_ID = "sayyes-turnstile-script";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileOptions = {
  sitekey: string;
  action: string;
  execution: "execute";
  appearance: "interaction-only";
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileGateHandle = {
  execute: () => Promise<string>;
};

type PendingChallenge = {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
  timer: number;
};

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const onLoad = () => resolve();
    const onError = () => {
      turnstileScriptPromise = null;
      reject(new Error("UPLOAD_VERIFICATION_UNAVAILABLE"));
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return turnstileScriptPromise;
}

export const TurnstileGate = forwardRef<TurnstileGateHandle>(
  function TurnstileGate(_props, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const widgetPromiseRef = useRef<Promise<string> | null>(null);
    const pendingRef = useRef<PendingChallenge | null>(null);
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

    const rejectPending = useCallback((code = "UPLOAD_VERIFICATION_FAILED") => {
      const pending = pendingRef.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      pending.reject(new Error(code));
      pendingRef.current = null;
    }, []);

    const ensureWidget = useCallback(async () => {
      if (widgetIdRef.current && window.turnstile) {
        return widgetIdRef.current;
      }
      if (!sitekey || !containerRef.current) {
        throw new Error("UPLOAD_VERIFICATION_UNAVAILABLE");
      }
      if (!widgetPromiseRef.current) {
        widgetPromiseRef.current = loadTurnstileScript().then(() => {
          if (!window.turnstile || !containerRef.current) {
            throw new Error("UPLOAD_VERIFICATION_UNAVAILABLE");
          }
          const widgetId = window.turnstile.render(containerRef.current, {
            sitekey,
            action: "guest-upload",
            execution: "execute",
            appearance: "interaction-only",
            callback: (token) => {
              const pending = pendingRef.current;
              if (!pending) return;
              window.clearTimeout(pending.timer);
              pending.resolve(token);
              pendingRef.current = null;
            },
            "error-callback": () => rejectPending(),
            "expired-callback": () => rejectPending(),
            "timeout-callback": () => rejectPending(),
          });
          widgetIdRef.current = widgetId;
          return widgetId;
        }).catch((error) => {
          widgetPromiseRef.current = null;
          throw error;
        });
      }
      return widgetPromiseRef.current;
    }, [rejectPending, sitekey]);

    useEffect(() => {
      return () => {
        rejectPending("UPLOAD_VERIFICATION_UNAVAILABLE");
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
        widgetIdRef.current = null;
        widgetPromiseRef.current = null;
      };
    }, [rejectPending]);

    useImperativeHandle(
      ref,
      () => ({
        execute: async () => {
          const widgetId = await ensureWidget();
          return new Promise<string>((resolve, reject) => {
            if (!window.turnstile) {
              reject(new Error("UPLOAD_VERIFICATION_UNAVAILABLE"));
              return;
            }
            rejectPending();
            const timer = window.setTimeout(
              () => rejectPending("UPLOAD_VERIFICATION_TIMEOUT"),
              2 * 60 * 1000,
            );
            pendingRef.current = { resolve, reject, timer };
            window.turnstile.reset(widgetId);
            window.turnstile.execute(widgetId);
          });
        },
      }),
      [ensureWidget, rejectPending],
    );

    return <div ref={containerRef} aria-hidden="true" className="min-h-0" />;
  },
);
