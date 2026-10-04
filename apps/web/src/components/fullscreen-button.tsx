"use client";

import { Maximize2, Minimize2, RotateCw, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type FullscreenDocument = typeof document.documentElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
const safariChromeHiddenStorageKey = "lll:safari-chrome-hidden";

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  const isAppleTouchDevice = /iPhone|iPad|iPod/i.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isWebKit = /AppleWebKit/i.test(userAgent);
  const isSafariEngine = /Safari/i.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);
  return isAppleTouchDevice && isWebKit && isSafariEngine && !isOtherIOSBrowser;
}

function isTouchDevice() {
  return typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0);
}

export function useFullscreenState() {
  const [supported, setSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const documentElement = document.documentElement as FullscreenDocument;
    const supportsFullscreen = Boolean(documentElement.requestFullscreen || documentElement.webkitRequestFullscreen);
    const supportTimer = window.setTimeout(() => setSupported(supportsFullscreen), 0);
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === document.documentElement);
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    syncFullscreen();
    return () => { window.clearTimeout(supportTimer); document.removeEventListener("fullscreenchange", syncFullscreen); document.removeEventListener("webkitfullscreenchange", syncFullscreen); };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const documentElement = document.documentElement as FullscreenDocument;
      if (documentElement.requestFullscreen) await documentElement.requestFullscreen();
      else await documentElement.webkitRequestFullscreen?.();
    } catch {
      // Safari may reject document fullscreen; the gate provides a scroll-based fallback.
    }
  };
  return { supported, isFullscreen, toggleFullscreen };
}

export function FullscreenButton() {
  const { supported, isFullscreen, toggleFullscreen } = useFullscreenState();
  if (!supported) return null;
  return (
    <button type="button" className="fullscreen-button" aria-label={isFullscreen ? "フルスクリーンを終了" : "フルスクリーンにする"} aria-pressed={isFullscreen} onClick={() => void toggleFullscreen()}>
      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      <span>{isFullscreen ? "解除" : "全画面"}</span>
    </button>
  );
}

export function FullscreenRequired({ children }: { children: ReactNode }) {
  const { supported, isFullscreen, toggleFullscreen } = useFullscreenState();
  const [hydrated, setHydrated] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [browserChromeHidden, setBrowserChromeHidden] = useState(false);
  const initialViewportHeight = useRef<number | null>(null);
  const safariFallback = hydrated && isSafariBrowser() && isTouchDevice() && !isFullscreen;

  useEffect(() => {
    const orientationQuery = window.matchMedia("(orientation: portrait)");
    const visualViewport = window.visualViewport;
    const safariScrollLimit = 24;
    const readViewportHeight = () => visualViewport?.height ?? window.innerHeight;
    const syncBrowserChrome = () => {
      const baseline = initialViewportHeight.current ?? readViewportHeight();
      const isSafariScrollFallback = isSafariBrowser() && isTouchDevice() && !orientationQuery.matches;
      const scrollMoved = window.scrollY > 8;
      if (isSafariScrollFallback && window.scrollY > safariScrollLimit) window.scrollTo({ top: safariScrollLimit, behavior: "auto" });
      const viewportExpanded = !orientationQuery.matches && readViewportHeight() > baseline + 24;
      setBrowserChromeHidden(scrollMoved || viewportExpanded);
    };
    const syncOrientation = () => {
      initialViewportHeight.current = readViewportHeight();
      setPortrait(orientationQuery.matches);
      setBrowserChromeHidden(false);
    };
    const settle = window.setTimeout(() => {
      initialViewportHeight.current = readViewportHeight();
      const restoreHiddenChrome = isSafariBrowser() && isTouchDevice() && !orientationQuery.matches && sessionStorage.getItem(safariChromeHiddenStorageKey) === "1";
      setHydrated(true);
      setPortrait(orientationQuery.matches);
      setBrowserChromeHidden(restoreHiddenChrome || window.scrollY > 8);
      if (restoreHiddenChrome) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: safariScrollLimit, behavior: "auto" });
          window.setTimeout(() => window.scrollTo({ top: safariScrollLimit, behavior: "auto" }), 80);
        });
      } else {
        syncBrowserChrome();
      }
    }, 0);
    orientationQuery.addEventListener("change", syncOrientation);
    window.addEventListener("scroll", syncBrowserChrome, { passive: true });
    window.addEventListener("resize", syncBrowserChrome, { passive: true });
    visualViewport?.addEventListener("resize", syncBrowserChrome, { passive: true });
    return () => { window.clearTimeout(settle); orientationQuery.removeEventListener("change", syncOrientation); window.removeEventListener("scroll", syncBrowserChrome); window.removeEventListener("resize", syncBrowserChrome); visualViewport?.removeEventListener("resize", syncBrowserChrome); };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const lockDocumentScroll = safariFallback && !portrait && browserChromeHidden;
    if (lockDocumentScroll) {
      document.documentElement.classList.add("safari-chrome-hidden");
      sessionStorage.setItem(safariChromeHiddenStorageKey, "1");
      window.history.scrollRestoration = "manual";
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 24, behavior: "auto" });
        window.setTimeout(() => window.scrollTo({ top: 24, behavior: "auto" }), 80);
      });
    } else if (!safariFallback || portrait) {
      document.documentElement.classList.remove("safari-chrome-hidden");
      sessionStorage.removeItem(safariChromeHiddenStorageKey);
    }
    return () => {
      if (sessionStorage.getItem(safariChromeHiddenStorageKey) !== "1") document.documentElement.classList.remove("safari-chrome-hidden");
    };
  }, [hydrated, safariFallback, portrait, browserChromeHidden]);

  if (!hydrated || isFullscreen) return children;

  if (safariFallback && !portrait) {
    const contentClassName = browserChromeHidden ? undefined : "fullscreen-locked-content";
    const shellClassName = browserChromeHidden ? "fullscreen-required-shell safari-scroll-shell safari-chrome-hidden" : "fullscreen-required-shell safari-scroll-shell";
    return <div className={shellClassName}><div className={contentClassName} aria-hidden={!browserChromeHidden}>{children}</div><div className="fullscreen-scroll-spacer" aria-hidden="true" />{!browserChromeHidden && <div className="fullscreen-required-gate fullscreen-scroll-gate" role="dialog" aria-modal="true" aria-labelledby="fullscreen-scroll-title"><Smartphone size={30} aria-hidden="true" /><h2 id="fullscreen-scroll-title">画面を上へスワイプ</h2><p>Safariのツールバーを収納するため、画面を上へスクロールしてください。</p><button type="button" className="primary-button" onClick={() => { window.scrollTo({ top: 24, behavior: "smooth" }); }}><Smartphone size={17} />スクロールして開始</button></div>}</div>;
  }

  if (safariFallback && portrait) {
    return <div className="fullscreen-required-shell"><div className="fullscreen-locked-content" aria-hidden="true">{children}</div><div className="fullscreen-required-gate fullscreen-orientation-gate" role="dialog" aria-modal="true" aria-labelledby="fullscreen-orientation-title"><RotateCw size={34} aria-hidden="true" /><h2 id="fullscreen-orientation-title">横画面にしてください</h2><p>スマートフォンを横向きにするとプレイできます。</p></div></div>;
  }

  return <div className="fullscreen-required-shell"><div className="fullscreen-locked-content" aria-hidden="true">{children}</div><div className="fullscreen-required-gate" role="dialog" aria-modal="true" aria-labelledby="fullscreen-required-title"><Maximize2 size={30} aria-hidden="true" /><h2 id="fullscreen-required-title">フルスクリーンで開始</h2><p>{supported ? "プレイ中はフルスクリーン表示が必要です。" : "このブラウザはフルスクリーンに対応していません。"}</p>{supported && <button type="button" className="primary-button" onClick={() => void toggleFullscreen()}><Maximize2 size={17} />フルスクリーンにする</button>}</div></div>;
}
