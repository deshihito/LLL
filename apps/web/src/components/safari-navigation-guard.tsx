"use client";

import { useEffect, type ReactNode } from "react";

const storageKey = "lll:safari-chrome-hidden";
const scrollAnchor = 24;

function isSafariTouchLandscape() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const userAgent = navigator.userAgent;
  const appleTouch = /iPhone|iPad|iPod/i.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webKit = /AppleWebKit/i.test(userAgent);
  const otherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);
  return appleTouch && webKit && !otherIosBrowser && navigator.maxTouchPoints > 0 && !window.matchMedia("(orientation: portrait)").matches;
}

function isHiddenSession() {
  try {
    return sessionStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function SafariNavigationGuard({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    let restoreTimer: number | undefined;

    const restore = () => {
      if (!isHiddenSession() || !isSafariTouchLandscape()) return;
      root.classList.add("safari-chrome-hidden");
      history.scrollRestoration = "manual";
      if (window.scrollY === scrollAnchor) return;
      window.scrollTo({ top: scrollAnchor, behavior: "auto" });
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => window.scrollTo({ top: scrollAnchor, behavior: "auto" }), 80);
    };
    const sync = () => {
      if (isHiddenSession() && isSafariTouchLandscape()) restore();
      else if (!isHiddenSession()) root.classList.remove("safari-chrome-hidden");
    };
    const onScroll = () => {
      if (isHiddenSession() && isSafariTouchLandscape() && window.scrollY !== scrollAnchor) restore();
    };
    const onRouteChange = () => window.requestAnimationFrame(restore);

    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      onRouteChange();
      return result;
    };
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      onRouteChange();
      return result;
    };
    window.addEventListener("popstate", onRouteChange);
    window.addEventListener("pageshow", onRouteChange);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    const syncTimer = window.setInterval(sync, 250);
    sync();

    return () => {
      window.clearInterval(syncTimer);
      window.clearTimeout(restoreTimer);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", onRouteChange);
      window.removeEventListener("pageshow", onRouteChange);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return children;
}
