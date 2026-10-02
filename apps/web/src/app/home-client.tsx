"use client";

import { useState } from "react";
import { ArrowRight, BookOpen, Layers3, LogOut, Plus, Swords, Upload } from "lucide-react";
import { signOut } from "next-auth/react";

const navItems = [
  ["HOME", "ホーム"],
  ["CREATE", "カード生成"],
  ["BINDER", "バインダー"],
  ["DECK", "デッキ編成"],
  ["BATTLE", "バトル"],
] as const;

export default function HomeClient({ userName }: { userName: string }) {
  const [active, setActive] = useState("HOME");

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setActive("HOME")} aria-label="ホームへ戻る">LLL</button>
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          {navItems.map(([id, label]) => <button key={id} className={active === id ? "selected" : ""} onClick={() => setActive(id)}>{label}</button>)}
        </nav>
        <div className="account"><span className="account-name">{userName}</span><button className="logout-button" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut size={14} /> ログアウト</button></div>
      </header>

      <div className="mobile-nav">{navItems.map(([id, label]) => <button key={id} className={active === id ? "selected" : ""} onClick={() => setActive(id)}>{label}</button>)}</div>

      <section className="page-wrap">
        {active === "HOME" ? <HomePanel setActive={setActive} /> : <ModulePanel active={active} />}
      </section>
    </main>
  );
}

function HomePanel({ setActive }: { setActive: (id: string) => void }) {
  return <>
    <div className="page-intro"><p className="overline">LLL / MAIN</p><h1>カードを作って、<br />デッキを組む。</h1><p>画像から自分だけのカードを作成し、バトルの準備を進めます。</p></div>
    <div className="home-grid">
      <button className="action-card primary" onClick={() => setActive("CREATE")}><div><span className="icon-box"><Plus size={18} /></span><h2>カードを生成</h2><p>画像をアップロードしてカードを作成</p></div><ArrowRight size={18} /></button>
      <button className="action-card" onClick={() => setActive("BINDER")}><div><span className="icon-box"><BookOpen size={18} /></span><h2>バインダーを見る</h2><p>作成したカードを確認</p></div><ArrowRight size={18} /></button>
      <button className="action-card" onClick={() => setActive("DECK")}><div><span className="icon-box"><Layers3 size={18} /></span><h2>デッキを編成</h2><p>最大20枚のデッキを準備</p></div><ArrowRight size={18} /></button>
      <button className="action-card" onClick={() => setActive("BATTLE")}><div><span className="icon-box"><Swords size={18} /></span><h2>バトルへ進む</h2><p>対戦モードを選択</p></div><ArrowRight size={18} /></button>
    </div>
    <div className="empty-home"><BookOpen size={19} /><p>カードはまだありません</p><button onClick={() => setActive("CREATE")}>最初のカードを作成 <ArrowRight size={14} /></button></div>
  </>;
}

function ModulePanel({ active }: { active: string }) {
  const data: Record<string, { title: string; description: string }> = {
    CREATE: { title: "カード生成", description: "カードにしたい画像をアップロードしてください。" },
    BINDER: { title: "バインダー", description: "作成したカードを一覧で確認できます。" },
    DECK: { title: "デッキ編成", description: "カードを選択して、20枚のデッキを作成します。" },
    BATTLE: { title: "バトル", description: "使用するデッキと対戦モードを選択します。" },
  };
  const { title, description } = data[active];
  return <div className="module-panel"><div className="page-intro compact"><p className="overline">LLL / {active}</p><h1>{title}</h1><p>{description}</p></div>{active === "CREATE" ? <div className="upload-panel"><Upload size={23} /><h2>画像をアップロード</h2><p>ドラッグ＆ドロップ、またはファイルを選択</p><button className="outline-button">ファイルを選択</button><span className="deferred">AI解析・カード発行機能は準備中です</span></div> : active === "BINDER" ? <div className="empty-panel"><BookOpen size={23} /><h2>カードはまだありません</h2><p>カードを生成すると、ここに表示されます。</p><button className="outline-button">カードを生成</button></div> : <div className="empty-panel"><span className="icon-box">{active === "DECK" ? <Layers3 size={18} /> : <Swords size={18} />}</span><h2>{active === "DECK" ? "デッキを作成" : "対戦を選択"}</h2><p>{active === "DECK" ? "カードを追加する画面を準備中です。" : "CPU戦・対人戦の画面を準備中です。"}</p><span className="deferred">この機能は順次追加されます</span></div>}</div>;
}
