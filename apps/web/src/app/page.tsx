import { auth, signOut } from "@/auth";
import Link from "next/link";
import Image from "next/image";
import { Gamepad2, LogIn, LogOut, CheckCircle2, Shield, Radio, MessageSquare, Globe } from "lucide-react";

export default async function Home() {
  const session = await auth();
  const user = session?.user;

  // サーバーアクションとしてサインアウトを定義
  const handleSignOut = async () => {
    "use server";
    await signOut({ redirectTo: "/" });
  };

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* 背景装飾 */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30 pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-[150px] pointer-events-none" />

      {/* ヘッダー */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/50 backdrop-blur-md relative z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <span className="text-xl font-black tracking-widest text-white">LLL</span>
          </div>
          
          <div>
            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2.5">
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt={user.name || "アバター"}
                      width={32}
                      height={32}
                      className="rounded-full border border-indigo-500/30"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-indigo-400">
                      {user.name?.[0] || "U"}
                    </div>
                  )}
                  <span className="hidden sm:inline text-sm font-medium text-zinc-300">{user.name}</span>
                </div>
                <form action={handleSignOut}>
                  <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-white rounded-lg transition duration-200">
                    <LogOut className="w-3.5 h-3.5" />
                    ログアウト
                  </button>
                </form>
              </div>
            ) : (
              <Link href="/login" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white rounded-xl shadow-lg shadow-indigo-600/20 transition duration-200 active:scale-[0.98]">
                <LogIn className="w-4 h-4" />
                ログイン / 連携
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* メインエリア */}
      <div className="flex-1 max-w-5xl mx-auto px-6 py-12 md:py-20 relative z-10 w-full flex flex-col md:flex-row gap-12 items-center justify-center">
        
        {/* 左側：キャッチコピー */}
        <div className="flex-1 space-y-6 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Next-Gen Dynamic Card Game
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">
            あなたの決断が<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400">
              カードを動かす。
            </span>
          </h2>
          <p className="text-zinc-400 text-base md:text-lg max-w-lg mx-auto md:mx-0">
            動的カードゲーム「LLL」へようこそ。Googleアカウントでの簡単ログインと、Discord連携による双方向のゲーム体験を提供します。
          </p>

          <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
            {user ? (
              <button className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold rounded-xl shadow-xl shadow-indigo-600/20 transition duration-200 active:scale-[0.98]">
                ゲームをプレイ (準備中)
              </button>
            ) : (
              <Link href="/login" className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold rounded-xl shadow-xl shadow-indigo-600/20 transition duration-200 text-center active:scale-[0.98]">
                アカウントを連携して開始
              </Link>
            )}
            <a href="https://github.com/deshihito/LLL" target="_blank" rel="noopener noreferrer" className="px-8 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white font-bold rounded-xl transition duration-200 text-center">
              GitHubを見る
            </a>
          </div>
        </div>

        {/* 右側：連携ステータスカード */}
        <div className="w-full max-w-md bg-zinc-900/60 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 md:p-8 shadow-2xl relative">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            アカウント連携ステータス
          </h3>

          <div className="space-y-4">
            {/* Google 連携枠 */}
            <div className={`p-4 rounded-xl border ${
              user && user.provider === 'google'
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-zinc-950/40 border-zinc-800'
            } transition duration-300`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-zinc-800 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Google アカウント連携</h4>
                    <p className="text-xs text-zinc-500">ゲームセーブデータのクラウド同期</p>
                  </div>
                </div>
                
                {user && user.provider === 'google' ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    連携中
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 font-medium">未連携</div>
                )}
              </div>
            </div>

            {/* Discord 連携枠 */}
            <div className={`p-4 rounded-xl border ${
              user && user.provider === 'discord'
                ? 'bg-emerald-500/5 border-emerald-500/30'
                : 'bg-zinc-950/40 border-zinc-800'
            } transition duration-300`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/20 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-[#5865F2]" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">Discord アカウント連携</h4>
                    <p className="text-xs text-zinc-500">Bot通知、ゲームコミュニティ連携</p>
                  </div>
                </div>
                
                {user && user.provider === 'discord' ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    連携中
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 font-medium">未連携</div>
                )}
              </div>
            </div>
          </div>

          {user && (
            <div className="mt-6 p-4 rounded-xl bg-indigo-950/30 border border-indigo-900/30 text-indigo-200 text-xs leading-relaxed">
              現在、<span className="font-extrabold text-white">{user.provider === 'google' ? 'Google' : 'Discord'}</span> アカウントでセッションが作成されています。ゲームの本実装開始に伴い、自動的にプレイヤープロファイルが生成されます。
            </div>
          )}
        </div>

      </div>

      {/* フッター */}
      <footer className="border-t border-zinc-900 bg-black/40 py-6 text-center text-xs text-zinc-600 relative z-10">
        <p>© 2026 LLL Project. All rights reserved.</p>
      </footer>
    </main>
  );
}
