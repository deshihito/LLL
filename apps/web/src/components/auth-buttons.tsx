"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

const discordMark = (
  <svg aria-hidden="true" viewBox="0 0 127.14 96.36" className="h-5 w-5 fill-current">
    <path d="M107.7 8.07A105.15 105.15 0 0 0 77.26 0a77.19 77.19 0 0 0-3.3 6.83 96.67 96.67 0 0 0-20.74 0A77.19 77.19 0 0 0 49.88 0 105.15 105.15 0 0 0 19.44 8.07C3.66 31.58-1.86 54.65 1 77.53a105.73 105.73 0 0 0 31 18.83 77.7 77.7 0 0 0 6.63-10.85 68.43 68.43 0 0 1-10.5-5c.88-.65 1.72-1.34 2.51-2a75.58 75.58 0 0 0 73 0c.79.71 1.63 1.4 2.52 2a68.43 68.43 0 0 1-10.5 5 77.7 77.7 0 0 0 6.63 10.85 105.73 105.73 0 0 0 31-18.83c2.86-29.41-3.62-52.26-19.29-69.46ZM42.45 65.69C36.18 65.69 31 60 31 53s5.18-12.64 11.45-12.64S53.83 46 53.83 53s-5.11 12.69-11.38 12.69Zm42.24 0C78.41 65.69 73.24 60 73.24 53s5.17-12.64 11.45-12.64S96.07 46 96.07 53s-5.07 12.69-11.38 12.69Z" />
  </svg>
);

function googleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M21.35 12.23c0-.72-.06-1.42-.18-2.09H12v3.96h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.26Z" />
      <path fill="#34A853" d="M12 21.6c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.53A9.74 9.74 0 0 0 12 21.6Z" />
      <path fill="#FBBC05" d="M6.53 13.68A5.86 5.86 0 0 1 6.22 12c0-.58.11-1.15.31-1.68V7.79H3.28A9.6 9.6 0 0 0 2.26 12c0 1.52.36 2.95 1.02 4.21l3.25-2.53Z" />
      <path fill="#EA4335" d="M12 6.29c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.84 3.37 14.63 2.4 12 2.4a9.74 9.74 0 0 0-8.72 5.39l3.25 2.53C7.3 8.01 9.46 6.29 12 6.29Z" />
    </svg>
  );
}

export default function AuthButtons() {
  const [loading, setLoading] = useState<"google" | "discord" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";

  const connect = async (provider: "google" | "discord") => {
    if (!authEnabled) {
      setError("テストモード");
      return;
    }

    setLoading(provider);
    setError(null);

    try {
      const result = await signIn(provider, {
        callbackUrl: "/",
        redirect: false,
      });

      if (!result || result.error) {
        setError("連携設定を確認してください");
        setLoading(null);
        return;
      }

      window.location.assign(result.url ?? "/");
    } catch {
      setError("連携設定を確認してください");
      setLoading(null);
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <button
        type="button"
        onClick={() => connect("google")}
        disabled={loading !== null}
        className="flex h-12 items-center justify-center gap-3 rounded-lg bg-white px-5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
      >
        {loading === "google" ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-slate-900" /> : googleMark()}
        Googleと連携
      </button>

      <button
        type="button"
        onClick={() => connect("discord")}
        disabled={loading !== null}
        className="flex h-12 items-center justify-center gap-3 rounded-lg bg-[#5865F2] px-5 text-sm font-semibold text-white transition hover:bg-[#4752C4] disabled:cursor-wait disabled:opacity-60"
      >
        {loading === "discord" ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" /> : discordMark}
        Discordと連携
      </button>

      {error ? <p className="text-center text-xs text-slate-500">{error}</p> : null}
    </div>
  );
}
