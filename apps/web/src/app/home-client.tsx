/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @next/next/no-location-assign-relative-destination */
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
  return <div className="module-panel"><div className="page-intro compact"><button className="back-link" onClick={() => setActive("HOME")}><ArrowLeft size={14} /> ホーム</button><p className="overline">LLL / {active}</p><h1>{title}</h1><p>{description}</p></div>{active === "CREATE" ? <CreateFlow onBack={() => setActive("HOME")} /> : active === "BATTLE" ? <MatchFlow onOpenDeck={() => setActive("DECK")} /> : active === "BINDER" ? <BinderPanel setActive={setActive} /> : active === "DECK" ? <DeckPanel /> : active === "PROFILE" ? <ProfilePanel user={user} /> : active === "NOTIFICATIONS" ? <NotificationsPanel /> : active === "SETTINGS" ? <SettingsPanel user={user} /> : <EmptyPanel icon={<CircleHelp size={22} />} title={`${title}を準備中`} description="この画面への導線だけ先に用意しています。" />}</div>;
}


type BinderCard = { id: string; title: string; description: string | null; card_type: string; hp: number; atk: number; shield: number; speed: number; generation_status: "ready" | "processing" | "draft" | "failed"; created_at: string };

function BinderPanel({ setActive }: { setActive: (id: string) => void }) {
  const [cards, setCards] = useState<BinderCard[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = async () => { setState("loading"); try { const response = await fetch("/api/cards"); const body = await response.json(); if (!response.ok) throw new Error(body.error); setCards(body.cards ?? []); setState("ready"); } catch { setState("error"); } };
  useEffect(() => { void load(); }, []);
  if (state === "loading") return <div className="empty-panel"><span className="loading-ring" /><h2>カードを読み込み中</h2><p>バインダーを確認しています。</p></div>;
  if (state === "error") return <div className="empty-panel"><X size={24} /><h2>取得できませんでした</h2><p>カード一覧を取得できませんでした。</p><button className="outline-button" onClick={() => void load()}><RefreshCw size={14} /> 再読み込み</button></div>;
  if (!cards.length) return <EmptyPanel icon={<BookOpen size={23} />} title="カードはまだありません" description="カードを生成すると、ここに表示されます。" action="カードを生成" onAction={() => setActive("CREATE")} />;
  return <div className="binder-grid">{cards.map((card) => <button className="binder-card" key={card.id} onClick={() => window.location.assign(`/cards/${card.id}`)}><div className="binder-card-top"><span className="card-type">{card.card_type.toUpperCase()}</span><span className={`status status-${card.generation_status}`}>{({ ready: "生成済み", processing: "解析中", draft: "下書き", failed: "生成失敗" } as Record<string, string>)[card.generation_status]}</span></div><h2>{card.title}</h2><p>{card.description || "説明はありません"}</p><div className="stat-row"><span>HP <b>{card.hp}</b></span><span>ATK <b>{card.atk}</b></span><span>SHIELD <b>{card.shield}</b></span><span>SPEED <b>{card.speed}</b></span></div></button>)}</div>;
}


type DeckSummary = { id: string; name: string };
type OwnedCard = { id: string; title: string; card_type: "action" | "part" | "support" };
type DeckCard = { id: string; card_id: string; slot_index: number; role: string; card: OwnedCard | null };
function DeckPanel() {
  const [decks, setDecks] = useState<DeckSummary[]>([]); const [cards, setCards] = useState<OwnedCard[]>([]); const [selected, setSelected] = useState(""); const [deckCards, setDeckCards] = useState<DeckCard[]>([]); const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const loadDecks = async () => { const [decksResponse, cardsResponse] = await Promise.all([fetch("/api/decks"), fetch("/api/cards")]); const decksBody = await decksResponse.json(); const cardsBody = await cardsResponse.json(); if (!decksResponse.ok) throw new Error(decksBody.error); if (!cardsResponse.ok) throw new Error(cardsBody.error); setDecks(decksBody.decks ?? []); setCards(cardsBody.cards ?? []); const next = selected || decksBody.decks?.[0]?.id || ""; setSelected(next); };
  const loadDeck = async (id: string) => { if (!id) { setDeckCards([]); return; } const response = await fetch(`/api/decks/${id}`); const body = await response.json(); if (!response.ok) throw new Error(body.error); setName(body.deck.name); setDeckCards(body.cards ?? []); };
  useEffect(() => { loadDecks().catch((caught) => setError(caught instanceof Error ? caught.message : "取得できませんでした")); }, []);
  useEffect(() => { loadDeck(selected).catch((caught) => setError(caught instanceof Error ? caught.message : "取得できませんでした")); }, [selected]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存に失敗しました"); } finally { setBusy(false); } };
  const create = () => run(async () => { const response = await fetch("/api/decks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "My Deck" }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setDecks((items) => [body.deck, ...items]); setSelected(body.deck.id); });
  const saveName = () => run(async () => { const response = await fetch(`/api/decks/${selected}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setDecks((items) => items.map((item) => item.id === selected ? body.deck : item)); });
  const removeDeck = () => run(async () => { const response = await fetch(`/api/decks/${selected}`, { method: "DELETE" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); const rest = decks.filter((item) => item.id !== selected); setDecks(rest); setSelected(rest[0]?.id || ""); });
  const addCard = (card: OwnedCard) => run(async () => { const response = await fetch(`/api/decks/${selected}/cards`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: card.id, role: card.card_type }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); await loadDeck(selected); });
  const removeCard = (cardId: string) => run(async () => { const response = await fetch(`/api/decks/${selected}/cards/${cardId}`, { method: "DELETE" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); await loadDeck(selected); });
  if (!decks.length) return <div className="empty-panel"><Layers3 size={23} /><h2>デッキはまだありません</h2><p>デッキを作成してカードを追加できます。</p><button className="primary-button" onClick={create} disabled={busy}>デッキを作成</button>{error && <p className="profile-message error">{error}</p>}</div>;
  const inDeck = new Set(deckCards.map((item) => item.card_id));
  return <div className="deck-panel"><div className="deck-toolbar"><select value={selected} onChange={(event) => setSelected(event.target.value)}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select><button className="outline-button" onClick={create} disabled={busy}>新規デッキ</button><button className="text-button" onClick={removeDeck} disabled={busy}>削除</button></div><div className="deck-name-edit"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /><button className="outline-button" onClick={saveName} disabled={busy || !name.trim()}>{busy ? "保存中" : "名前を保存"}</button></div><div className="deck-count">デッキ {deckCards.length} / 20 枚</div><div className="deck-slots">{Array.from({ length: 20 }, (_, index) => { const item = deckCards[index]; return <div className={`deck-slot ${item ? "filled" : ""}`} key={index}><span>{index + 1}</span>{item ? <><b>{item.card?.title || "カード"}</b><button onClick={() => removeCard(item.card_id)} disabled={busy}>削除</button></> : <small>空き</small>}</div>; })}</div><h2 className="subheading">所有カード</h2><div className="owned-cards">{cards.map((card) => <div className="owned-card" key={card.id}><div><b>{card.title}</b><small>{card.card_type}</small></div><button className="outline-button" onClick={() => addCard(card)} disabled={busy || inDeck.has(card.id) || deckCards.length >= 20}>{inDeck.has(card.id) ? "追加済み" : "追加"}</button></div>)}</div>{error && <p className="profile-message error">{error}</p>}</div>;
}


type NotificationItem = { id: string; title: string; body: string | null; read_at: string | null; created_at: string };
function NotificationsPanel() {
  const [items, setItems] = useState<NotificationItem[]>([]); const [error, setError] = useState(""); const unread = items.filter((item) => !item.read_at).length;
  const load = async () => { const response = await fetch("/api/notifications"); const body = await response.json(); if (!response.ok) throw new Error(body.error); setItems(body.notifications ?? []); };
  useEffect(() => { load().catch((caught) => setError(caught instanceof Error ? caught.message : "取得できませんでした")); }, []);
  const mark = async (id?: string) => { const response = await fetch(id ? `/api/notifications/${id}` : "/api/notifications/read-all", { method: id ? "PATCH" : "POST" }); const body = await response.json(); if (!response.ok) { setError(body.error); return; } await load(); };
  if (error && !items.length) return <div className="empty-panel"><Bell size={22} /><h2>通知を取得できませんでした</h2><p>{error}</p><button className="outline-button" onClick={() => load().catch(() => setError("取得できませんでした"))}>再読み込み</button></div>;
  return <div className="notifications-panel"><div className="notification-summary"><b>未読 {unread} 件</b><button className="outline-button" onClick={() => mark()} disabled={!unread}>すべて既読</button></div>{!items.length ? <div className="empty-panel"><Bell size={22} /><h2>通知はありません</h2><p>新しい通知が届くとここに表示されます。</p></div> : <div className="notification-list">{items.map((item) => <article className={`notification-item ${item.read_at ? "read" : "unread"}`} key={item.id}><div><b>{item.title}</b><p>{item.body || ""}</p><small>{new Date(item.created_at).toLocaleString("ja-JP")}</small></div>{!item.read_at && <button className="outline-button" onClick={() => mark(item.id)}>既読</button>}</article>)}</div>}{error && <p className="profile-message error">{error}</p>}</div>;
}
function SettingsPanel({ user }: { user: User }) {
  const [form, setForm] = useState({ display_name: user.name ?? "", timezone: "Asia/Tokyo", locale: "ja-JP", notifications_enabled: true }); const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading"); const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/settings").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setForm((current) => ({ ...current, ...body.settings })); setState("ready"); }).catch((caught) => { setMessage(caught instanceof Error ? caught.message : "取得できませんでした"); setState("error"); }); }, []);
  const save = async () => { setState("saving"); setMessage(""); const response = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(form) }); const body = await response.json(); if (!response.ok) { setMessage(body.error ?? "保存に失敗しました"); setState("error"); return; } setForm((current) => ({ ...current, ...body.settings })); setMessage("保存しました"); setState("saved"); };
  return <div className="settings-panel"><label>表示名<input value={form.display_name} maxLength={80} disabled={state === "loading" || state === "saving"} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label><label>タイムゾーン<select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option>Asia/Tokyo</option><option>UTC</option><option>America/Los_Angeles</option></select></label><label>言語<select value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value })}><option value="ja-JP">日本語</option><option value="en-US">English</option></select></label><label className="toggle-row"><span>通知を受け取る</span><input type="checkbox" checked={form.notifications_enabled} onChange={(event) => setForm({ ...form, notifications_enabled: event.target.checked })} /></label><button className="primary-button" onClick={save} disabled={state === "loading" || state === "saving" || !form.display_name.trim()}>{state === "saving" ? "保存中" : "保存"}</button>{message && <p className={`profile-message ${state === "error" ? "error" : ""}`}>{message}</p>}</div>;
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

function MatchFlow({ onOpenDeck }: { onOpenDeck: () => void }) {
  return <div className="battle-choice"><div className="choice-row"><Swords size={20} /><div><b>オンライン対戦</b><small>マッチング機能は準備中です。現在は対戦相手を探せません。</small></div><button className="primary-button" disabled aria-disabled="true">マッチング開始</button></div><div className="choice-row muted-choice"><Layers3 size={20} /><div><b>使用デッキ</b><small>対戦に使用するデッキの選択機能は準備中です。</small></div><button className="outline-button" onClick={onOpenDeck}>デッキ編成へ</button></div></div>;
}

function ProfilePanel({ user }: { user: User }) {
  const [username, setUsername] = useState(user.name ?? "ユーザー");
  const [savedUsername, setSavedUsername] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  useEffect(() => { fetch("/api/profile").then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setUsername(body.profile.username); setStatus("ready"); }).catch(() => setStatus("error")); }, []);
  const save = async () => { setStatus("saving"); setSavedUsername(""); const response = await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ username }) }); const body = await response.json(); if (!response.ok) { setSavedUsername(body.error ?? "保存できませんでした"); setStatus("error"); return; } setUsername(body.profile.username); setSavedUsername("保存しました"); setStatus("saved"); };
  return <div className="profile-panel"><div className="profile-identity"><span className="avatar profile-avatar">{username.slice(0, 1).toUpperCase()}</span><div><h2>{username}</h2><p>{user.email ?? "メールアドレス未取得"}</p></div></div><div className="profile-rows"><div><span>表示名</span><label className="profile-edit"><input value={username} maxLength={80} disabled={status === "loading" || status === "saving"} onChange={(event) => setUsername(event.target.value)} /><button className="outline-button" disabled={status === "loading" || status === "saving" || !username.trim()} onClick={save}>{status === "saving" ? "保存中" : "保存"}</button></label></div><div><span>ログイン方法</span><b>{user.provider ?? "認証済み"}</b></div><div><span>アカウント状態</span><b>利用中</b></div></div>{status === "error" && <p className="profile-message error">{savedUsername || "プロフィールを取得できませんでした"}</p>}{status === "saved" && <p className="profile-message">{savedUsername}</p>}</div>;
}
function EmptyPanel({ icon, title, description, action, onAction }: { icon: React.ReactNode; title: string; description: string; action?: string; onAction?: () => void }) { return <div className="empty-panel">{icon}<h2>{title}</h2><p>{description}</p>{action && onAction ? <button className="outline-button" onClick={onAction}>{action}</button> : null}<span className="deferred">この機能は順次追加されます</span></div>; }
