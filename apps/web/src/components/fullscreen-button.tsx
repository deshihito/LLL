"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";

export function FullscreenButton() {
  const [supported, setSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const documentElement = document.documentElement as typeof document.documentElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const supportsFullscreen = Boolean(documentElement.requestFullscreen || documentElement.webkitRequestFullscreen);
    const supportTimer = window.setTimeout(() => setSupported(supportsFullscreen), 0);

    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === document.documentElement);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => { window.clearTimeout(supportTimer); document.removeEventListener("fullscreenchange", syncFullscreen); };
  }, []);

  if (!supported) return null;

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const documentElement = document.documentElement as typeof document.documentElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (documentElement.requestFullscreen) await documentElement.requestFullscreen();
      else await documentElement.webkitRequestFullscreen?.();
    } catch {
      // Browsers can reject fullscreen when the gesture is no longer trusted.
    }
  };

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
