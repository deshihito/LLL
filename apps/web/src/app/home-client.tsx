"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Bell, BookOpen, Check, CircleHelp, ImagePlus, Layers3, LogOut, Plus, RefreshCw, Settings, Swords, UserRound, X } from "lucide-react";
import { signOut } from "next-auth/react";

const navItems = [["HOME", "ホーム"], ["CREATE", "カード生成"], ["BINDER", "バインダー"], ["DECK", "デッキ編成"], ["BATTLE", "バトル"]] as const;
const userMenuItems = [["PROFILE", "プロフィール", UserRound], ["NOTIFICATIONS", "通知", Bell], ["SETTINGS", "設定", Settings], ["HELP", "ヘルプ", CircleHelp]] as const;
const APP_VERSION = "v2026.10.02-21";

type User = { name?: string | null; email?: string | null; provider?: string };
type FlowResult = { id: string; title: string; description: string; hp: number; atk: number; shield: number; speed: number; skills?: Array<{ name: string; power: number }> };

export default function HomeClient({ user }: { user: User }) {
  const [active, setActive] = useState("HOME");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const displayName = user.name ?? "ユーザー";
  const open = (id: string) => { setActive(id); setUserMenuOpen(false); };

  return <main className="app-shell">
    <header className="topbar">
      <button className="wordmark" onClick={() => open("HOME")} aria-label="ホームへ戻る">LLL</button>
      <nav className="desktop-nav" aria-label="メインナビゲーション">{navItems.map(([id, label]) => <button key={id} className={active === id ? "selected" : ""} onClick={() => open(id)}>{label}</button>)}</nav>
      <div className="account-wrap"><button className="account-trigger" onClick={() => setUserMenuOpen((value) => !value)} aria-expanded={userMenuOpen} aria-haspopup="menu"><span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span><span className="account-name">{displayName}</span></button>{userMenuOpen && <div className="user-menu" role="menu"><div className="user-summary"><span className="avatar large">{displayName.slice(0, 1).toUpperCase()}</span><div><b>{displayName}</b><small>{user.email ?? "ログイン済み"}</small></div></div>{userMenuItems.map(([id, label, Icon]) => <button key={id} onClick={() => open(id)} role="menuitem"><Icon size={15} />{label}<span className="menu-arrow">›</span></button>)}<button onClick={() => signOut({ callbackUrl: "/login" })} role="menuitem"><LogOut size={15} />ログアウト</button></div>}</div>
    </header>
    <div className="mobile-nav">{navItems.map(([id, label]) => <button key={id} className={active === id ? "selected" : ""} onClick={() => open(id)}>{label}</button>)}</div>
    <section className="page-wrap">{active === "HOME" ? <HomePanel setActive={open} userName={displayName} /> : <ModulePanel active={active} setActive={open} user={user} />}</section><span className="app-version" aria-label={`アプリバージョン ${APP_VERSION}`}>{APP_VERSION}</span>
  </main>;
}

function HomePanel({ setActive, userName }: { setActive: (id: string) => void; userName: string }) {
  return <><div className="page-intro"><p className="overline">LLL / MAIN</p><h1>{userName}さん、<br />何を始めますか。</h1><p>カードを作成し、デッキとバトルの準備を進めます。</p></div><div className="home-grid">
    <button className="action-card primary" onClick={() => setActive("CREATE")}><div><span className="icon-box"><Plus size={18} /></span><h2>カードを生成</h2><p>画像をアップロードしてカードを作成</p></div><ArrowRight size={18} /></button>
    <button className="action-card" onClick={() => setActive("BINDER")}><div><span className="icon-box"><BookOpen size={18} /></span><h2>バインダーを見る</h2><p>作成したカードを確認</p></div><ArrowRight size={18} /></button>
    <button className="action-card" onClick={() => setActive("DECK")}><div><span className="icon-box"><Layers3 size={18} /></span><h2>デッキを編成</h2><p>最大20枚のデッキを準備</p></div><ArrowRight size={18} /></button>
    <button className="action-card" onClick={() => setActive("BATTLE")}><div><span className="icon-box"><Swords size={18} /></span><h2>バトルへ進む</h2><p>マッチング画面へ進む</p></div><ArrowRight size={18} /></button>
  </div><div className="empty-home"><BookOpen size={19} /><p>カードはまだありません</p><button onClick={() => setActive("CREATE")}>最初のカードを作成 <ArrowRight size={14} /></button></div></>;
}

function ModulePanel({ active, setActive, user }: { active: string; setActive: (id: string) => void; user: User }) {
  const labels: Record<string, [string, string]> = { CREATE: ["カード生成", "画像からカードを作成します。"], BINDER: ["バインダー", "作成したカードを確認します。"], DECK: ["デッキ編成", "カードを選択してデッキを準備します。"], BATTLE: ["バトル", "準備したデッキで対戦します。"], PROFILE: ["プロフィール", "ユーザー情報とアカウント連携を管理します。"], NOTIFICATIONS: ["通知", "カード生成や対戦に関する通知を確認します。"], SETTINGS: ["設定", "表示、アカウント、ゲーム設定を管理します。"], HELP: ["ヘルプ", "LLLの使い方を確認します。" ] };
  const [title, description] = labels[active] ?? [active, ""];
  return <div className="module-panel"><div className="page-intro compact"><button className="back-link" onClick={() => setActive("HOME")}><ArrowLeft size={14} /> ホーム</button><p className="overline">LLL / {active}</p><h1>{title}</h1><p>{description}</p></div>{active === "CREATE" ? <CreateFlow onBack={() => setActive("HOME")} /> : active === "BATTLE" ? <MatchFlow /> : active === "BINDER" ? <EmptyPanel icon={<BookOpen size={23} />} title="カードはまだありません" description="カードを生成すると、ここに表示されます。" action="カードを生成" onAction={() => setActive("CREATE")} /> : active === "DECK" ? <EmptyPanel icon={<Layers3 size={18} />} title="デッキ編成を準備中" description="カードが揃うとデッキを保存できます。" /> : active === "PROFILE" ? <ProfilePanel user={user} /> : <EmptyPanel icon={active === "NOTIFICATIONS" ? <Bell size={22} /> : active === "SETTINGS" ? <Settings size={22} /> : <CircleHelp size={22} />} title={`${title}を準備中`} description="この画面への導線だけ先に用意しています。" />}</div>;
}

function CreateFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<"select" | "preview" | "processing" | "result" | "issued" | "error">("select");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<FlowResult | null>(null);
  const [error, setError] = useState("");

  const choose = (selected: File | undefined) => { if (!selected) return; setFile(selected); setPreview(URL.createObjectURL(selected)); setStep("preview"); setError(""); };
  const generate = async () => {
    if (!file) return;
    setStep("processing"); setError("");
    try {
      const form = new FormData(); form.append("image", file);
      const upload = await fetch("/api/cards", { method: "POST", body: form });
      const uploaded = await upload.json();
      if (!upload.ok) throw new Error(uploaded.error ?? "画像を保存できませんでした");
      const response = await fetch("/api/generate-card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: uploaded.job.id, cardId: uploaded.card.id }) });
      const generated = await response.json();
      if (!response.ok) throw new Error(generated.error ?? "カード生成に失敗しました");
      setResult(generated.card); setStep("result");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "カード生成に失敗しました"); setStep("error"); }
  };

  if (step === "select") return <div className="flow-panel"><FlowSteps current={1} /><label className="upload-panel upload-select"><ImagePlus size={28} /><h2>カード画像を選択</h2><p>PNG、JPG、WEBP / 10MB以下</p><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choose(event.target.files?.[0])} /><span className="outline-button">ファイルを選択</span></label><button className="text-button" onClick={onBack}>キャンセル</button></div>;
  if (step === "preview") return <div className="flow-panel"><FlowSteps current={2} /><div className="preview-panel"><Image src={preview} alt="カード画像プレビュー" width={300} height={330} unoptimized /><div><p className="overline">STEP 2 / PREVIEW</p><h2>この画像で生成しますか？</h2><p>生成には数秒かかる場合があります。</p><button className="primary-button" onClick={generate}>カードを解析する <ArrowRight size={15} /></button><button className="text-button" onClick={() => setStep("select")}>画像を選び直す</button></div></div></div>;
  if (step === "processing") return <div className="flow-panel"><FlowSteps current={3} /><div className="empty-panel processing-panel"><span className="loading-ring" /><h2>カードを解析中</h2><p>画像からカード情報を生成しています。</p><span className="deferred">Gemini / PROCESSING</span></div></div>;
  if (step === "error") return <div className="flow-panel"><FlowSteps current={3} /><div className="empty-panel"><X size={24} /><h2>生成できませんでした</h2><p>{error}</p><button className="outline-button" onClick={generate}><RefreshCw size={14} /> もう一度試す</button><button className="text-button" onClick={() => setStep("select")}>画像を選び直す</button></div></div>;
  if (step === "issued") return <div className="flow-panel"><FlowSteps current={5} /><div className="empty-panel success-panel"><Check size={26} /><h2>カードを発行しました</h2><p>カードがバインダーに保存されました。</p><button className="primary-button" onClick={() => setStep("select")}>もう1枚作る <Plus size={15} /></button></div></div>;
  return <div className="flow-panel"><FlowSteps current={4} /><div className="result-panel"><div className="result-card"><span className="result-card-mark">✦</span><b>{result?.title}</b><small>ACTION CARD</small></div><div className="result-info"><p className="overline">STEP 4 / RESULT</p><h2>{result?.title}</h2><p>{result?.description}</p><div className="stat-row"><span>HP <b>{result?.hp}</b></span><span>ATK <b>{result?.atk}</b></span><span>SHIELD <b>{result?.shield}</b></span><span>SPEED <b>{result?.speed}</b></span></div><button className="primary-button" onClick={() => setStep("issued")}>カードを発行する <Check size={15} /></button></div></div></div>;
}

function FlowSteps({ current }: { current: number }) { return <div className="flow-steps">{["画像選択", "プレビュー", "解析", "結果", "発行"].map((label, index) => <span className={index + 1 <= current ? "current" : ""} key={label}><i>{index + 1}</i>{label}</span>)}</div>; }

function MatchFlow() {
  const [status, setStatus] = useState<"lobby" | "matching" | "found" | "canceled">("lobby");
  useEffect(() => { if (status !== "matching") return; const timer = window.setTimeout(() => setStatus("found"), 1800); return () => window.clearTimeout(timer); }, [status]);
  if (status === "matching") return <div className="empty-panel matching-panel"><span className="loading-ring" /><h2>対戦相手を探しています</h2><p>先着順でマッチングしています。</p><span className="deferred">最大120秒 / キャンセル可能</span><button className="text-button" onClick={() => setStatus("canceled")}>キャンセル</button></div>;
  if (status === "found") return <div className="empty-panel"><Check size={24} /><h2>対戦相手が見つかりました</h2><p>デッキを確認して準備完了を押してください。</p><button className="primary-button" onClick={() => setStatus("lobby")}>準備完了</button><button className="text-button" onClick={() => setStatus("canceled")}>辞退する</button></div>;
  if (status === "canceled") return <div className="empty-panel"><X size={24} /><h2>マッチングを終了しました</h2><p>もう一度マッチングを開始できます。</p><button className="outline-button" onClick={() => setStatus("lobby")}>バトル画面へ戻る</button></div>;
  return <div className="battle-choice"><div className="choice-row"><Swords size={20} /><div><b>オンライン対戦</b><small>保存済みデッキで対戦相手を探します。</small></div><button className="primary-button" onClick={() => setStatus("matching")}>マッチング開始 <ArrowRight size={15} /></button></div><div className="choice-row muted-choice"><Layers3 size={20} /><div><b>使用デッキ</b><small>デッキ編成画面で準備してください。</small></div><button className="outline-button">デッキを選択</button></div></div>;
}

function ProfilePanel({ user }: { user: User }) { return <div className="profile-panel"><div className="profile-identity"><span className="avatar profile-avatar">{(user.name ?? "ユーザー").slice(0, 1).toUpperCase()}</span><div><h2>{user.name ?? "ユーザー"}</h2><p>{user.email ?? "メールアドレス未取得"}</p></div></div><div className="profile-rows"><div><span>ログイン方法</span><b>{user.provider ?? "認証済み"}</b></div><div><span>アカウント状態</span><b>利用中</b></div></div></div>; }
function EmptyPanel({ icon, title, description, action, onAction }: { icon: React.ReactNode; title: string; description: string; action?: string; onAction?: () => void }) { return <div className="empty-panel">{icon}<h2>{title}</h2><p>{description}</p>{action && onAction ? <button className="outline-button" onClick={onAction}>{action}</button> : null}<span className="deferred">この機能は順次追加されます</span></div>; }
