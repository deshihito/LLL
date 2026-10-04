"use client";

import { Maximize2, Minimize2, RotateCw, Smartphone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type FullscreenDocument = typeof document.documentElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  return /Safari/i.test(userAgent) && !/Chrome|CriOS|Android/i.test(userAgent);
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
    syncFullscreen();
    return () => { window.clearTimeout(supportTimer); document.removeEventListener("fullscreenchange", syncFullscreen); };
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
  const safariFallback = hydrated && isSafariBrowser() && isTouchDevice() && !isFullscreen;

  useEffect(() => {
    const orientationQuery = window.matchMedia("(orientation: portrait)");
    const syncOrientation = () => setPortrait(orientationQuery.matches);
    const syncScroll = () => setBrowserChromeHidden(window.scrollY > 8);
    const settle = window.setTimeout(() => { setHydrated(true); syncOrientation(); syncScroll(); }, 0);
    orientationQuery.addEventListener("change", syncOrientation);
    window.addEventListener("scroll", syncScroll, { passive: true });
    return () => { window.clearTimeout(settle); orientationQuery.removeEventListener("change", syncOrientation); window.removeEventListener("scroll", syncScroll); };
  }, []);

  if (!hydrated || isFullscreen || (safariFallback && !portrait && browserChromeHidden)) return children;

  if (safariFallback && portrait) {
    return <div className="fullscreen-required-shell"><div className="fullscreen-locked-content" aria-hidden="true">{children}</div><div className="fullscreen-required-gate fullscreen-orientation-gate" role="dialog" aria-modal="true" aria-labelledby="fullscreen-orientation-title"><RotateCw size={34} aria-hidden="true" /><h2 id="fullscreen-orientation-title">横画面にしてください</h2><p>スマートフォンを横向きにするとプレイできます。</p></div></div>;
  }

  if (safariFallback) {
    return <div className="fullscreen-required-shell"><div className="fullscreen-locked-content" aria-hidden="true">{children}</div><div className="fullscreen-required-gate fullscreen-scroll-gate" role="dialog" aria-modal="true" aria-labelledby="fullscreen-scroll-title"><Smartphone size={30} aria-hidden="true" /><h2 id="fullscreen-scroll-title">画面を上へスワイプ</h2><p>Safariのツールバーを収納するため、画面を上へスクロールしてください。</p><button type="button" className="primary-button" onClick={() => { window.scrollTo({ top: 16, behavior: "smooth" }); setBrowserChromeHidden(true); }}><Smartphone size={17} />スクロールして開始</button></div></div>;
  }

  return <div className="fullscreen-required-shell"><div className="fullscreen-locked-content" aria-hidden="true">{children}</div><div className="fullscreen-required-gate" role="dialog" aria-modal="true" aria-labelledby="fullscreen-required-title"><Maximize2 size={30} aria-hidden="true" /><h2 id="fullscreen-required-title">フルスクリーンで開始</h2><p>{supported ? "プレイ中はフルスクリーン表示が必要です。" : "このブラウザはフルスクリーンに対応していません。"}</p>{supported && <button type="button" className="primary-button" onClick={() => void toggleFullscreen()}><Maximize2 size={17} />フルスクリーンにする</button>}</div></div>;
}
