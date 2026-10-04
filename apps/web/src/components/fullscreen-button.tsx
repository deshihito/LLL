"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type FullscreenDocument = typeof document.documentElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

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
      // Browsers can reject fullscreen when the gesture is no longer trusted.
    }
  };

  return { supported, isFullscreen, toggleFullscreen };
}

export function FullscreenButton() {
  const { supported, isFullscreen, toggleFullscreen } = useFullscreenState();
  if (!supported) return null;
  return (
    <button
      type="button"
      className="fullscreen-button"
      aria-label={isFullscreen ? "フルスクリーンを終了" : "フルスクリーンにする"}
      aria-pressed={isFullscreen}
      onClick={() => void toggleFullscreen()}
    >
      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      <span>{isFullscreen ? "解除" : "全画面"}</span>
    </button>
  );
}

export function FullscreenRequired({ children }: { children: ReactNode }) {
  const { supported, isFullscreen, toggleFullscreen } = useFullscreenState();
  if (isFullscreen) return children;
  return (
    <div className="fullscreen-required-shell">
      <div className="fullscreen-locked-content" aria-hidden="true">{children}</div>
      <div className="fullscreen-required-gate" role="dialog" aria-modal="true" aria-labelledby="fullscreen-required-title">
        <Maximize2 size={30} aria-hidden="true" />
        <h2 id="fullscreen-required-title">フルスクリーンで開始</h2>
        <p>{supported ? "プレイ中はフルスクリーン表示が必要です。" : "このブラウザはフルスクリーンに対応していません。"}</p>
        {supported && <button type="button" className="primary-button" onClick={() => void toggleFullscreen()}><Maximize2 size={17} />フルスクリーンにする</button>}
      </div>
    </div>
  );
}
