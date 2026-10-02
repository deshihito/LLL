"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Gamepad2, Globe } from "lucide-react";

export default function LoginPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleLogin = async (provider: "google" | "discord") => {
    setLoading(provider);
    try {
      await signIn(provider, { callbackUrl: "/" });
    } catch (e) {
      console.error(e);
      setLoading(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 relative overflow-hidden">
      {/* 背景装飾 */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-2xl p-8 shadow-2xl shadow-indigo-500/5 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 mb-4 animate-pulse">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-indigo-400">
            LLL
          </h1>
          <p className="text-sm text-zinc-400 mt-2">
            動的カードゲーム LLL プレイヤーポータル
          </p>
        </div>

        <div className="space-y-4">
          {/* Google連携ログイン */}
          <button
            onClick={() => handleLogin("google")}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-white text-zinc-900 hover:bg-zinc-100 font-semibold rounded-xl transition duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-md"
          >
            {loading === "google" ? (
              <div className="w-5 h-5 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Globe className="w-5 h-5 text-indigo-600" />
            )}
            Google で連携・ログイン
          </button>

          {/* Discord連携ログイン */}
          <button
            onClick={() => handleLogin("discord")}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold rounded-xl transition duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-[#5865F2]/10"
          >
            {loading === "discord" ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 fill-current" viewBox="0 0 127.14 96.36">
                <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.88-.65,1.72-1.34,2.51-2a75.58,75.58,0,0,0,73,0c.79.71,1.63,1.4,2.52,2a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,48.12,123.39,25.27,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
              </svg>
            )}
            Discord で連携・ログイン
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
          <a
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            ← トップページへ戻る
          </a>
        </div>
      </div>
    </main>
  );
}
