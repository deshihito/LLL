"use client";

import { useState } from "react";
import { ArrowRight, Bell, BookOpen, CircleHelp, Layers3, LogOut, Plus, Settings, Swords, Upload, UserRound } from "lucide-react";
import { signOut } from "next-auth/react";

const navItems = [
  ["HOME", "ホーム"],
  ["CREATE", "カード生成"],
  ["BINDER", "バインダー"],
  ["DECK", "デッキ編成"],
  ["BATTLE", "バトル"],
] as const;

const userMenuItems = [
  ["PROFILE", "プロフィール", UserRound],
  ["NOTIFICATIONS", "通知", Bell],
  ["SETTINGS", "設定", Settings],
  ["HELP", "ヘルプ", CircleHelp],
] as const;

type User = { name?: string | null; email?: string | null; image?: string | null; provider?: string };

export default function HomeClient({ user }: { user: User }) {
  const [active, setActive] = useState("HOME");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const displayName = user.name ?? "ユーザー";
  const initial = displayName.slice(0, 1).toUpperCase();

  const openModule = (id: string) => {
    setActive(id);
    setUserMenuOpen(false);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => openModule("HOME")} aria-label="ホームへ戻る">LLL</button>
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          {navItems.map(([id, label]) => <button key={id} className={active === id ? "selected" : ""} onClick={() => openModule(id)}>{label}</button>)}
        </nav>
        <div className="account-wrap">
          <button className="account-trigger" onClick={() => setUserMenuOpen((open) => !open)} aria-expanded={userMenuOpen} aria-haspopup="menu">
            <span className="avatar">{initial}</span><span className="account-name">{displayName}</span>
          </button>
          {userMenuOpen ? <div className="user-menu" role="menu">
            <div className="user-summary"><span className="avatar large">{initial}</span><div><b>{displayName}</b><small>{user.email ?? "ログイン済み"}</small></div></div>
            {userMenuItems.map(([id, label, Icon]) => <button key={id} onClick={() => openModule(id)} role="menuitem"><Icon size={15} />{label}<span className="menu-arrow">›</span></button>)}
            <button onClick={() => signOut({ callbackUrl: "/login" })} role="menuitem"><LogOut size={15} />ログアウト</button>
          </div> : null}
        </div>
      </header>

      <div className="mobile-nav">{navItems.map(([id, label]) => <button key={id} className={active === id ? "selected" : ""} onClick={() => openModule(id)}>{label}</button>)}</div>

      <section className="page-wrap">
        {active === "HOME" ? <HomePanel setActive={openModule} userName={displayName} /> : <ModulePanel active={active} setActive={openModule} user={user} />}
      </section>
    </main>
  );
}

function HomePanel({ setActive, userName }: { setActive: (id: string) => void; userName: string }) {
  return <>
    <div className="page-intro"><p className="overline">LLL / MAIN</p><h1>{userName}さん、<br />何を始めますか。</h1><p>カードを作成し、デッキとバトルの準備を進めます。</p></div>
    <div className="home-grid">
      <button className="action-card primary" onClick={() => setActive("CREATE")}><div><span className="icon-box"><Plus size={18} /></span><h2>カードを生成</h2><p>画像をアップロードしてカードを作成</p></div><ArrowRight size={18} /></button>
      <button className="action-card" onClick={() => setActive("BINDER")}><div><span className="icon-box"><BookOpen size={18} /></span><h2>バインダーを見る</h2><p>作成したカードを確認</p></div><ArrowRight size={18} /></button>
      <button className="action-card" onClick={() => setActive("DECK")}><div><span className="icon-box"><Layers3 size={18} /></span><h2>デッキを編成</h2><p>最大20枚のデッキを準備</p></div><ArrowRight size={18} /></button>
      <button className="action-card" onClick={() => setActive("BATTLE")}><div><span className="icon-box"><Swords size={18} /></span><h2>バトルへ進む</h2><p>対戦モードを選択</p></div><ArrowRight size={18} /></button>
    </div>
    <div className="empty-home"><BookOpen size={19} /><p>カードはまだありません</p><button onClick={() => setActive("CREATE")}>最初のカードを作成 <ArrowRight size={14} /></button></div>
  </>;
}

function ModulePanel({ active, setActive, user }: { active: string; setActive: (id: string) => void; user: User }) {
  const data: Record<string, { title: string; description: string }> = {
    CREATE: { title: "カード生成", description: "カードにしたい画像をアップロードしてください。" },
    BINDER: { title: "バインダー", description: "作成したカードを一覧で確認できます。" },
    DECK: { title: "デッキ編成", description: "カードを選択して、20枚のデッキを作成します。" },
    BATTLE: { title: "バトル", description: "使用するデッキと対戦モードを選択します。" },
    PROFILE: { title: "プロフィール", description: "ユーザー情報とアカウント連携を管理します。" },
    NOTIFICATIONS: { title: "通知", description: "カード生成や対戦に関する通知を確認します。" },
    SETTINGS: { title: "設定", description: "表示、アカウント、ゲーム設定を管理します。" },
    HELP: { title: "ヘルプ", description: "LLLの使い方とよくある質問を確認します。" },
  };
  const { title, description } = data[active];
  const userPanel = active === "PROFILE";
  const futurePanel = ["NOTIFICATIONS", "SETTINGS", "HELP"].includes(active);

  return <div className="module-panel"><div className="page-intro compact"><p className="overline">LLL / {active}</p><h1>{title}</h1><p>{description}</p></div>{active === "CREATE" ? <div className="upload-panel"><Upload size={23} /><h2>画像をアップロード</h2><p>ドラッグ＆ドロップ、またはファイルを選択</p><button className="outline-button">ファイルを選択</button><span className="deferred">AI解析・カード発行機能は準備中です</span></div> : active === "BINDER" ? <EmptyPanel icon={<BookOpen size={23} />} title="カードはまだありません" description="カードを生成すると、ここに表示されます。" action="カードを生成" onAction={() => setActive("CREATE")} /> : active === "DECK" ? <EmptyPanel icon={<Layers3 size={18} />} title="デッキを作成" description="カードを追加する画面を準備中です。" /> : active === "BATTLE" ? <EmptyPanel icon={<Swords size={18} />} title="対戦を選択" description="CPU戦・対人戦の画面を準備中です。" /> : userPanel ? <div className="profile-panel"><div className="profile-identity"><span className="avatar profile-avatar">{(user.name ?? "ユーザー").slice(0, 1).toUpperCase()}</span><div><h2>{user.name ?? "ユーザー"}</h2><p>{user.email ?? "メールアドレス未取得"}</p></div></div><div className="profile-rows"><div><span>ログイン方法</span><b>{user.provider === "discord" ? "Discord" : user.provider === "google" ? "Google" : "認証済み"}</b></div><div><span>アカウント状態</span><b>利用中</b></div></div><button className="outline-button">プロフィールを編集</button><span className="deferred">プロフィール編集機能は準備中です</span></div> : futurePanel ? <EmptyPanel icon={active === "NOTIFICATIONS" ? <Bell size={22} /> : active === "SETTINGS" ? <Settings size={22} /> : <CircleHelp size={22} />} title={`${title}を準備中`} description="この導線は今後の機能追加用に設置しています。" /> : null}</div>;
}

function EmptyPanel({ icon, title, description, action, onAction }: { icon: React.ReactNode; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-panel">{icon}<h2>{title}</h2><p>{description}</p>{action && onAction ? <button className="outline-button" onClick={onAction}>{action}</button> : null}<span className="deferred">この機能は順次追加されます</span></div>;
}
