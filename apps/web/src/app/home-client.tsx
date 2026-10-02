/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @next/next/no-location-assign-relative-destination */
"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, BookOpen, Check, ChevronRight,
  CircleHelp, Clock3, ImagePlus, Layers3, LogOut, Plus, RefreshCw, Search,
  Settings, Shield, Sparkles, Swords, Trash2, UserRound, X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { CardDisplay, type DisplayCard } from "@/components/card-display";

const navItems = [
  ["HOME", "ホーム", "/"], ["SCOUT", "スカウト", "/scout"],
  ["BINDER", "バインダー", "/binder"], ["DECK", "デッキ編成", "/decks"], ["BATTLE", "バトル", "/battle"],
] as const;
const sectionPaths: Record<string, string> = {
  HOME: "/", SCOUT: "/scout", CREATE: "/scout", BINDER: "/binder", DECK: "/decks", BATTLE: "/battle",
  PROFILE: "/profile", NOTIFICATIONS: "/notifications", SETTINGS: "/settings", HELP: "/help",
};
const userMenuItems = [["PROFILE", "プロフィール", UserRound], ["NOTIFICATIONS", "通知", Bell], ["SETTINGS", "設定", Settings], ["HELP", "ヘルプ", CircleHelp]] as const;
const labelMap: Record<string, [string, string]> = {
  SCOUT: ["スカウト", "画像から、あなただけのカードを生み出します。"],
  CREATE: ["スカウト", "画像から、あなただけのカードを生み出します。"],
  BINDER: ["バインダー", "集めたカードを探して、見比べましょう。"],
  DECK: ["デッキ編成", "カードを選び、戦いの準備を整えます。"],
  BATTLE: ["バトルアリーナ", "デッキを選び、対戦相手を探します。"],
  PROFILE: ["プロフィール", "ユーザー情報とアカウント連携を管理します。"],
  NOTIFICATIONS: ["通知", "カード生成や対戦に関する通知を確認します。"],
  SETTINGS: ["設定", "表示、アカウント、ゲーム設定を管理します。"],
  HELP: ["ヘルプ", "LLLの遊び方を確認します。"],
};

type User = { id?: string; name?: string | null; email?: string | null; provider?: string };
type ScoutTier = "normal" | "elite" | "legend";
type CardRecord = DisplayCard & {
  description: string | null;
  card_type: "action" | "support" | "part";
  parent_card_id?: string | null;
  hp: number;
  atk: number;
  shield: number;
  speed: number;
  generation_status: "ready" | "processing" | "draft" | "failed";
  scout_tier: ScoutTier | null;
  created_at: string;
  skills?: unknown[];
};
type DeckSummary = { id: string; name: string };
type DeckCard = { id: string; card_id: string; slot_index: number; role: string; card: CardRecord | null };

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "処理に失敗しました");
  return body as T;
}

async function cropForCard(file: File, positionPercent: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const targetRatio = 9 / 16;
  const sourceRatio = bitmap.width / bitmap.height;
  let sx = 0; let sy = 0; let sw = bitmap.width; let sh = bitmap.height;
  if (sourceRatio > targetRatio) { sw = bitmap.height * targetRatio; sx = (bitmap.width - sw) * positionPercent / 100; }
  else if (sourceRatio < targetRatio) { sh = bitmap.width / targetRatio; sy = (bitmap.height - sh) * positionPercent / 100; }
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 1820;
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("画像を切り抜けませんでした。別の画像をお試しください。"); }
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height); bitmap.close();
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("画像を切り抜けませんでした。")), outputType, .92));
  const baseName = file.name.replace(/\.[^.]+$/, "") || "scout-image";
  const extension = outputType === "image/png" ? "png" : "jpg";
  return new File([blob], `${baseName}-card.${extension}`, { type: outputType, lastModified: Date.now() });
}

export default function HomeClient({ user }: { user: User }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathToSection: Record<string, string> = { "/": "HOME", "/scout": "SCOUT", "/binder": "BINDER", "/decks": "DECK", "/battle": "BATTLE", "/profile": "PROFILE", "/notifications": "NOTIFICATIONS", "/settings": "SETTINGS", "/help": "HELP" };
  const active = pathToSection[pathname] ?? "HELP";
  const displayName = user.name?.trim() || "プレイヤー";
  const navigate = (section: string) => {
    router.push(sectionPaths[section] ?? "/");
    setMenuOpen(false);
  };

  return <main className={`app-shell ${active === "BATTLE" ? "app-shell-battle" : ""}`}>
    <header className="topbar">
      <button className="brand-lockup" onClick={() => navigate("HOME")} aria-label="LLL ホームへ">
        <Image src="/lll-logo.jpg" alt="LLL" width={58} height={32} priority />
      </button>
      <nav className="desktop-nav" aria-label="メインナビゲーション">
        {navItems.map(([id, label, path]) => <button key={id} className={active === id ? "selected" : ""} aria-current={active === id ? "page" : undefined} onClick={() => router.push(path)}>{label}</button>)}
      </nav>
      <div className="account-wrap">
        <button className="account-trigger" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-haspopup="menu">
          <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span><span className="account-name">{displayName}</span><ChevronRight className={menuOpen ? "account-chevron open" : "account-chevron"} size={14} />
        </button>
        {menuOpen && <div className="user-menu" role="menu">
          <div className="user-summary"><span className="avatar large">{displayName.slice(0, 1).toUpperCase()}</span><div><b>{displayName}</b><small>{user.email ?? "ログイン済み"}</small></div></div>
          {userMenuItems.map(([id, label, Icon]) => <button key={id} onClick={() => navigate(id)} role="menuitem"><Icon size={16} />{label}<ChevronRight className="menu-arrow" size={14} /></button>)}
          <button onClick={() => signOut({ callbackUrl: "/login" })} role="menuitem"><LogOut size={16} />ログアウト</button>
        </div>}
      </div>
    </header>
    <nav className="mobile-nav" aria-label="メインナビゲーション">
      {navItems.map(([id, label, path]) => <button key={id} className={active === id ? "selected" : ""} aria-current={active === id ? "page" : undefined} onClick={() => router.push(path)}>{label}</button>)}
    </nav>
    <section className="page-wrap">
      {active === "HOME" ? <HomePanel userName={displayName} navigate={navigate} /> : <ModulePanel active={active} user={user} navigate={navigate} />}
    </section>
  </main>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="overline">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>;
}

function HomePanel({ userName, navigate }: { userName: string; navigate: (section: string) => void }) {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let live = true;
    Promise.all([fetch("/api/cards").then((response) => readJson<{ cards: CardRecord[] }>(response)), fetch("/api/decks").then((response) => readJson<{ decks: DeckSummary[] }>(response))])
      .then(([cardResult, deckResult]) => { if (live) { setCards(cardResult.cards ?? []); setDecks(deckResult.decks ?? []); setStatus("ready"); } })
      .catch(() => { if (live) setStatus("error"); });
    return () => { live = false; };
  }, []);
  const readyCards = cards.filter((card) => card.generation_status === "ready");
  const latestCard = [...readyCards].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const latestDeck = decks[0];
  const firstVisit = status === "ready" && readyCards.length === 0;

  return <div className="home-dashboard">
    <section className="home-hero">
      <div className="home-hero-copy">
        <p className="overline"><Sparkles size={13} /> YOUR CARD UNIVERSE</p>
        <h1>{userName}さん、<br />次の一枚を迎えよう。</h1>
        <p>イメージをカードに。集めて、組み合わせて、戦場へ。</p>
        <button className="primary-button hero-cta" onClick={() => navigate("SCOUT")}><Sparkles size={17} />{firstVisit ? "最初のカードをスカウト" : "新しいカードをスカウト"}<ArrowRight size={17} /></button>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-sigil">LLL</div><Sparkles className="hero-spark hero-spark-one" size={20} /><Sparkles className="hero-spark hero-spark-two" size={13} /></div>
    </section>

    <section className="journey-strip" aria-label="遊び方の流れ">
      <div className="journey-step current"><span>01</span><b>スカウト</b><small>画像からカードを作る</small></div><ChevronRight size={18} aria-hidden="true" />
      <div className={`journey-step ${readyCards.length ? "current" : ""}`}><span>02</span><b>コレクション</b><small>カードを集める</small></div><ChevronRight size={18} aria-hidden="true" />
      <div className={`journey-step ${decks.length ? "current" : ""}`}><span>03</span><b>デッキ</b><small>戦いの準備をする</small></div><ChevronRight size={18} aria-hidden="true" />
      <div className="journey-step"><span>04</span><b>バトル</b><small>アリーナへ向かう</small></div>
    </section>

    {status === "error" && <div className="inline-alert" role="status">コレクションを読み込めませんでした。<button onClick={() => window.location.reload()}>再読み込み</button></div>}
    <section className="dashboard-grid">
      <article className="dashboard-panel collection-panel">
        <div className="panel-heading"><div><p className="overline">YOUR COLLECTION</p><h2>バインダー</h2></div><button className="link-button" onClick={() => navigate("BINDER")}>すべて見る <ArrowRight size={15} /></button></div>
        {status === "loading" ? <div className="home-loading"><span className="loading-ring" />コレクションを読み込み中</div> : latestCard ? <div className="featured-card"><button className="featured-card-art" onClick={() => window.location.assign(`/cards/${latestCard.id}`)} aria-label={`${latestCard.title}の詳細を見る`}><CardDisplay card={latestCard} size="small" /></button><div><span className="eyebrow-chip">最近のカード</span><h3>{latestCard.title}</h3><p>あなたのコレクションに加わりました。</p><div className="mini-stat-row"><span>HP <b>{latestCard.hp}</b></span><span>ATK <b>{latestCard.atk}</b></span></div><button className="text-button" onClick={() => navigate("BINDER")}>バインダーを開く <ArrowRight size={14} /></button></div></div> : <div className="dashboard-empty"><BookOpen size={22} /><div><b>バインダーはまだ空です</b><p>最初のカードをスカウトして、コレクションを始めましょう。</p></div><button className="secondary-button" onClick={() => navigate("SCOUT")}>スカウトする <ArrowRight size={15} /></button></div>}
        {status === "ready" && <div className="collection-count"><span>登録カード</span><b>{readyCards.length}<small> 枚</small></b></div>}
      </article>
      <article className="dashboard-panel deck-panel-home">
        <div className="panel-heading"><div><p className="overline">BATTLE PREPARATION</p><h2>デッキ</h2></div><span className="panel-icon"><Layers3 size={18} /></span></div>
        {latestDeck ? <><div className="deck-home-card"><span className="deck-emblem"><Shield size={22} /></span><div><span className="eyebrow-chip">選択中のデッキ</span><h3>{latestDeck.name}</h3><p>カードを確認してバトルの準備をしましょう。</p></div></div><button className="secondary-button full-button" onClick={() => navigate("DECK")}>デッキを編集 <ArrowRight size={15} /></button></> : <div className="dashboard-empty compact-empty"><Layers3 size={22} /><div><b>デッキを作成しましょう</b><p>カードを組み合わせて、自分だけの戦い方を準備。</p></div><button className="secondary-button" onClick={() => navigate("DECK")}>編成を始める <ArrowRight size={15} /></button></div>}
        <button className="arena-link" onClick={() => navigate("BATTLE")}><Swords size={17} />アリーナへ <ArrowRight size={15} /></button>
      </article>
    </section>
  </div>;
}

function ModulePanel({ active, user, navigate }: { active: string; user: User; navigate: (section: string) => void }) {
  const [title, description] = labelMap[active] ?? labelMap.HELP;
  return <div className={`module-panel module-${active.toLowerCase()}`}>
    <button className="back-link" onClick={() => navigate("HOME")}><ArrowLeft size={15} />ホーム</button>
    {active !== "SCOUT" && <PageHeading eyebrow={`LLL / ${active}`} title={title} description={description} />}
    {active === "SCOUT" ? <ScoutPanel navigate={navigate} /> : active === "BINDER" ? <BinderPanel /> : active === "DECK" ? <DeckPanel navigate={navigate} /> : active === "BATTLE" ? <MatchFlow navigate={navigate} /> : active === "PROFILE" ? <ProfilePanel user={user} /> : active === "NOTIFICATIONS" ? <NotificationsPanel /> : active === "SETTINGS" ? <SettingsPanel user={user} /> : <EmptyPanel icon={<CircleHelp size={25} />} title="ヘルプを準備しています" description="カードの作り方とバトルの遊び方を順次追加します。" />}
  </div>;
}

function EmptyPanel({ icon, title, description, action, onAction }: { icon: React.ReactNode; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-state-icon">{icon}</span><h2>{title}</h2><p>{description}</p>{action && onAction && <button className="secondary-button" onClick={onAction}>{action}<ArrowRight size={15} /></button>}</div>;
}

function BinderPanel() {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "compact">("grid");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = async () => {
    setState("loading");
    try { const result = await readJson<{ cards: CardRecord[] }>(await fetch("/api/cards")); setCards(result.cards ?? []); setState("ready"); }
    catch { setState("error"); }
  };
  useEffect(() => { void load(); }, []);
  const visibleCards = useMemo(() => {
    const filtered = cards.filter((card) => (typeFilter === "all" || card.card_type === typeFilter)
      && (tierFilter === "all" || card.scout_tier === tierFilter)
      && (statusFilter === "all" || card.generation_status === statusFilter)
      && `${card.title} ${card.description ?? ""}`.toLocaleLowerCase("ja").includes(query.trim().toLocaleLowerCase("ja")));
    return filtered.sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "ja") : sort === "total" ? (b.hp + b.atk + b.shield + b.speed) - (a.hp + a.atk + a.shield + a.speed) : b.created_at.localeCompare(a.created_at));
  }, [cards, typeFilter, tierFilter, statusFilter, query, sort]);
  const removeCard = async (card: CardRecord) => {
    if (!window.confirm(`「${card.title}」を削除しますか？`)) return;
    setDeleting(card.id); setMessage("");
    try { await readJson(await fetch(`/api/cards/${card.id}`, { method: "DELETE" })); setCards((current) => current.filter((item) => item.id !== card.id)); setMessage("カードを削除しました。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "削除できませんでした。"); }
    finally { setDeleting(null); }
  };
  const resetFilters = () => { setQuery(""); setTypeFilter("all"); setTierFilter("all"); setStatusFilter("all"); };

  return <section className="binder-page">
    <div className="binder-toolbar">
      <label className="search-field"><Search size={17} /><span className="sr-only">カードを検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="カード名・説明で検索" /></label>
      <div className="binder-controls">
        <label><span>種別</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">すべて</option><option value="action">アクション</option><option value="support">サポート</option><option value="part">パーツ</option></select></label>
        <label><span>スカウト</span><select value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option value="all">すべて</option><option value="normal">ノーマル</option><option value="elite">エリート</option><option value="legend">レジェンド</option></select></label>
        <label><span>状態</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">すべて</option><option value="ready">生成済み</option><option value="processing">解析中</option><option value="failed">失敗</option><option value="draft">下書き</option></select></label>
        <label><span>並び順</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">新しい順</option><option value="title">名前順</option><option value="total">能力合計順</option></select></label>
        <div className="view-toggle" role="group" aria-label="表示方法"><button aria-pressed={view === "grid"} className={view === "grid" ? "selected" : ""} onClick={() => setView("grid")}>カード</button><button aria-pressed={view === "compact"} className={view === "compact" ? "selected" : ""} onClick={() => setView("compact")}>一覧</button></div>
      </div>
    </div>
    <div className="collection-summary"><b>{visibleCards.length}</b> 枚 <span>／ 全 {cards.length} 枚</span></div>
    {state === "loading" ? <div className="empty-state"><span className="loading-ring" /><h2>バインダーを開いています</h2><p>カードを読み込んでいます。</p></div> : state === "error" ? <EmptyPanel icon={<X size={24} />} title="カードを読み込めませんでした" description="通信状態を確認して、もう一度お試しください。" action="再読み込み" onAction={() => void load()} /> : cards.length === 0 ? <EmptyPanel icon={<BookOpen size={25} />} title="バインダーはまだ空です" description="画像から最初のカードをスカウトして、コレクションを始めましょう。" action="スカウトへ" onAction={() => window.location.assign("/scout")} /> : visibleCards.length === 0 ? <EmptyPanel icon={<Search size={24} />} title="カードが見つかりません" description="検索語や絞り込み条件を変えてみてください。" action="条件をリセット" onAction={resetFilters} /> : <div className={`binder-grid ${view === "compact" ? "binder-grid-compact" : ""}`}>
      {visibleCards.map((card) => <article className="binder-item" key={card.id}>
        <button className="binder-card-open" onClick={() => window.location.assign(`/cards/${card.id}`)} aria-label={`${card.title}の詳細を開く`}><CardDisplay card={card} size={view === "compact" ? "small" : "medium"} showStats={view !== "compact"} />
          <div className="binder-item-copy"><div className="binder-item-heading"><h2>{card.title}</h2><span className={`card-state state-${card.generation_status}`}><i aria-hidden="true" />{{ ready: "生成済み", processing: "解析中", draft: "下書き", failed: "要確認" }[card.generation_status]}</span></div>
            {view === "compact" && <div className="binder-inline-stats"><span>HP {card.hp}</span><span>ATK {card.atk}</span><span>DEF {card.shield}</span><span>SPD {card.speed}</span></div>}
            <p>{card.description || "カードの説明はありません。"}</p>
          </div>
        </button>
        {card.scout_tier && <span className={`tier-label tier-label-${card.scout_tier}`}>{card.scout_tier === "legend" ? "LEGEND SCOUT" : card.scout_tier === "elite" ? "ELITE SCOUT" : "NORMAL SCOUT"}</span>}
        {(["draft", "failed"].includes(card.generation_status)) && <button className="delete-card-button" onClick={() => void removeCard(card)} disabled={deleting === card.id} aria-label={`${card.title}を削除`}><Trash2 size={14} />{deleting === card.id ? "削除中" : "削除"}</button>}
      </article>)}
    </div>}
    {message && <p className="form-feedback" role="status">{message}</p>}
  </section>;
}

function ScoutPanel({ navigate }: { navigate: (section: string) => void }) {
  const [type, setType] = useState<"action" | "support" | "part">("action");
  const [tier, setTier] = useState<ScoutTier>("normal");
  const [parent, setParent] = useState("");
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [started, setStarted] = useState(false);
  useEffect(() => { let live = true; fetch("/api/cards").then((response) => readJson<{ cards: CardRecord[] }>(response)).then((result) => { if (live) setCards(result.cards.filter((card) => card.card_type === "action" && card.generation_status === "ready")); }).catch(() => undefined); return () => { live = false; }; }, []);
  if (started) return <CreateFlow scoutType={type} scoutTier={tier} parentCardId={parent || undefined} onBack={() => setStarted(false)} navigate={navigate} />;
  const scoutTypes = [
    { id: "action" as const, title: "アクション", note: "前衛で戦うメインカード", icon: <Swords size={21} /> },
    { id: "support" as const, title: "サポート", note: "味方を支えるカード", icon: <Shield size={21} /> },
    { id: "part" as const, title: "パーツ", note: "アクションに装着するカード", icon: <Layers3 size={21} /> },
  ];
  const tiers: { id: ScoutTier; title: string; summary: string; description: string }[] = [
    { id: "normal", title: "ノーマル", summary: "NORMAL", description: "標準のステータス配分" },
    { id: "elite", title: "エリート", summary: "ELITE", description: "高めの総合値を目安に生成" },
    { id: "legend", title: "レジェンド", summary: "LEGEND", description: "さらに高い総合値を目安に生成" },
  ];
  const typeName = scoutTypes.find((item) => item.id === type)?.title ?? "アクション";
  const tierName = tiers.find((item) => item.id === tier)?.title ?? "ノーマル";
  return <div className="scout-page">
    <PageHeading eyebrow="LLL / SCOUT" title="新しいカードを迎える" description="カードの種類とスカウトランクを選んで、画像をアップロードします。" />
    <div className="scout-selection-grid">
      <section className="scout-step-card"><div className="step-title"><span>01</span><div><p className="overline">CARD TYPE</p><h2>どんなカードを作る？</h2></div></div>
        <div className="scout-type-options">{scoutTypes.map((item) => <button key={item.id} className={`scout-choice scout-type-${item.id} ${type === item.id ? "selected" : ""}`} aria-pressed={type === item.id} onClick={() => setType(item.id)}><span className="scout-choice-icon">{item.icon}</span><b>{item.title}</b><small>{item.note}</small><span className="choice-check"><Check size={14} /></span></button>)}</div>
        {type === "part" && <label className="field-label">装着するアクションカード<select value={parent} onChange={(event) => setParent(event.target.value)}><option value="">カードを選択</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.title}</option>)}</select></label>}
      </section>
      <section className="scout-step-card"><div className="step-title"><span>02</span><div><p className="overline">SCOUT TIER</p><h2>スカウトランク</h2></div></div>
        <div className="tier-options">{tiers.map((item) => <button key={item.id} className={`tier-choice tier-${item.id} ${tier === item.id ? "selected" : ""}`} aria-pressed={tier === item.id} onClick={() => setTier(item.id)}><span className="tier-glyph"><Sparkles size={18} /></span><span><small>{item.summary}</small><b>{item.title}</b><em>{item.description}</em></span><span className="choice-check"><Check size={14} /></span></button>)}</div>
        <p className="scout-disclaimer">ランクは生成時のステータス配分の目安です。出現確率や保証を示すものではありません。</p>
      </section>
    </div>
    <section className="scout-launch"><div className="launch-seal"><Sparkles size={22} /></div><div><span className="overline">READY TO DISCOVER</span><h2>{typeName}・{tierName}スカウト</h2><p>PNG / JPG / WEBP ・ 10MB以下</p></div><button className="primary-button" disabled={type === "part" && !parent} onClick={() => setStarted(true)}><ImagePlus size={17} />画像を選ぶ <ArrowRight size={16} /></button></section>
  </div>;
}

function CreateFlow({ onBack, scoutType, scoutTier, parentCardId, navigate }: { onBack: () => void; scoutType: "action" | "support" | "part"; scoutTier: ScoutTier; parentCardId?: string; navigate: (section: string) => void }) {
  const [step, setStep] = useState<"select" | "preview" | "processing" | "result" | "error">("select");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState<CardRecord | null>(null);
  const [draft, setDraft] = useState<{ id: string; jobId: string } | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cropPosition, setCropPosition] = useState(50);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (selected?: File) => {
    if (!selected) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(selected.type)) { setError("PNG・JPG・WEBP形式の画像を選んでください。"); setStep("error"); return; }
    if (selected.size > 10 * 1024 * 1024) { setError("画像は10MB以下にしてください。"); setStep("error"); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected); setPreview(URL.createObjectURL(selected)); setDraft(null); setResult(null); setError(""); setCropPosition(50); setImageAspect(null); setStep("preview");
  };
  const generate = async () => {
    if (!file) return;
    setStep("processing"); setError("");
    try {
      let target = draft;
      if (!target) {
        const cropped = await cropForCard(file, cropPosition);
        const form = new FormData(); form.append("image", cropped, cropped.name); form.append("cardType", scoutType); form.append("scoutTier", scoutTier); if (parentCardId) form.append("parentCardId", parentCardId);
        const uploaded = await readJson<{ card: CardRecord; job: { id: string } }>(await fetch("/api/cards", { method: "POST", body: form }));
        target = { id: uploaded.card.id, jobId: uploaded.job.id };
        setDraft(target);
      }
      const generated = await readJson<{ card: CardRecord }>(await fetch("/api/generate-card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: target.jobId, cardId: target.id }) }));
      setResult(generated.card); setStep("result");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "カードを生成できませんでした。"); setStep("error"); }
  };
  const reset = () => { setFile(null); setPreview(""); setDraft(null); setResult(null); setError(""); setStep("select"); };
  const stepNames = ["画像を選ぶ", "プレビュー", "カード生成", "完成"];
  const currentStep = step === "select" ? 1 : step === "preview" ? 2 : step === "processing" || step === "error" ? 3 : 4;
  const typeName = scoutType === "part" ? "パーツ" : scoutType === "support" ? "サポート" : "アクション";
  const tierName = scoutTier === "legend" ? "レジェンド" : scoutTier === "elite" ? "エリート" : "ノーマル";

  return <div className="create-flow">
    <div className="flow-heading"><button className="back-link" onClick={step === "select" ? onBack : reset}><ArrowLeft size={15} />{step === "select" ? "ランク選択へ戻る" : "画像を選び直す"}</button><span className="flow-context">{typeName} / {tierName}</span></div>
    <ol className="flow-steps" aria-label="スカウトの進行状況">{stepNames.map((name, index) => <li key={name} className={index + 1 <= currentStep ? "complete" : ""} aria-current={index + 1 === currentStep ? "step" : undefined}><span>{index + 1 < currentStep ? <Check size={13} /> : index + 1}</span>{name}</li>)}</ol>
    {step === "select" && <label className={`upload-dropzone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }}>
      <span className="upload-icon"><ImagePlus size={25} /></span><b>カードにしたい画像を選ぶ</b><span>ここに画像をドラッグ＆ドロップするか、ファイルを選択</span><small>PNG・JPG・WEBP ／ 10MB以下</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choose(event.target.files?.[0])} /><span className="secondary-button">画像ファイルを選択</span>
    </label>}
    {step === "preview" && file && <section className="upload-preview"><div className="preview-card-crop"><Image src={preview} alt="カードに切り抜かれる範囲のプレビュー" fill unoptimized sizes="(max-width: 720px) 70vw, 280px" onLoad={(event) => setImageAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} style={{ objectPosition: `${cropPosition}% ${cropPosition}%` }} /></div><div className="preview-copy"><span className="overline">IMAGE PREVIEW</span><h2>この画像でカードを作ります</h2><p>枠内の範囲を9:16に切り抜いてスカウトします。画像を動かして、残したい部分を合わせてください。</p>{imageAspect !== null && Math.abs(imageAspect - 9 / 16) > .01 && <label className="crop-control"><span>{imageAspect > 9 / 16 ? "左右の切り抜き位置" : "上下の切り抜き位置"}</span><input aria-label="カード画像の切り抜き位置" type="range" min="0" max="100" value={cropPosition} onChange={(event) => setCropPosition(Number(event.target.value))} /><small><span>端</span><span>中央</span><span>端</span></small></label>}<dl className="file-details"><div><dt>ファイル</dt><dd>{file.name}</dd></div><div><dt>サイズ</dt><dd>{(file.size / 1024 / 1024).toFixed(1)} MB</dd></div><div><dt>形式</dt><dd>{file.type.replace("image/", "").toUpperCase()}</dd></div></dl><button className="primary-button" onClick={() => void generate()}><Sparkles size={16} />カードを生成する <ArrowRight size={16} /></button><button className="text-button" onClick={reset}>別の画像を選ぶ</button></div></section>}
    {step === "processing" && <section className="generation-stage" role="status" aria-live="polite"><div className="generation-orbit"><Sparkles size={24} /></div><span className="overline">CARD CREATION</span><h2>画像からカードを作成しています</h2><p>解析が完了するまで、この画面を開いたままお待ちください。</p><span className="loading-ring" /></section>}
    {step === "error" && <section className="flow-message error-message" role="alert"><span className="state-icon"><X size={22} /></span><h2>カードを作成できませんでした</h2><p>{error}</p><div className="flow-actions"><button className="primary-button" onClick={() => draft ? void generate() : setStep("select")}><RefreshCw size={15} />{draft ? "同じ画像で再試行" : "画像を選び直す"}</button><button className="text-button" onClick={onBack}>スカウト選択へ戻る</button></div></section>}
    {step === "result" && result && <section className="result-showcase"><div className="reveal-card"><CardDisplay card={result} size="large" /></div><div className="result-copy"><span className={`tier-label tier-label-${scoutTier}`}>{tierName}スカウト</span><span className="overline">CARD DISCOVERED</span><h2>{result.title}</h2><p>{result.description || "新しいカードがコレクションに加わりました。"}</p><div className="result-stats">{[["HP", result.hp], ["ATK", result.atk], ["DEF", result.shield], ["SPD", result.speed]].map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div><p className="saved-note"><Check size={15} />カードは自動でバインダーに保存されました。</p><button className="primary-button" onClick={() => navigate("BINDER")}>バインダーで見る <ArrowRight size={16} /></button><button className="text-button" onClick={reset}><Plus size={15} />もう一枚スカウト</button></div></section>}
  </div>;
}

function DeckPanel({ navigate }: { navigate: (section: string) => void }) {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [deckCards, setDeckCards] = useState<DeckCard[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const loadDeck = async (id: string) => {
    if (!id) { setDeckCards([]); setPendingIds([]); setName(""); setSavedName(""); return; }
    const result = await readJson<{ deck: DeckSummary; cards: DeckCard[] }>(await fetch(`/api/decks/${id}`));
    setName(result.deck.name); setSavedName(result.deck.name); setDeckCards(result.cards ?? []); setPendingIds((result.cards ?? []).map((item) => item.card_id));
  };
  useEffect(() => { let live = true; Promise.all([fetch("/api/decks").then((response) => readJson<{ decks: DeckSummary[] }>(response)), fetch("/api/cards").then((response) => readJson<{ cards: CardRecord[] }>(response))]).then(async ([deckResult, cardResult]) => { if (!live) return; setDecks(deckResult.decks ?? []); setCards((cardResult.cards ?? []).filter((card) => card.generation_status === "ready")); const next = deckResult.decks?.[0]?.id ?? ""; setSelected(next); if (next) { const detail = await readJson<{ deck: DeckSummary; cards: DeckCard[] }>(await fetch(`/api/decks/${next}`)); if (!live) return; setName(detail.deck.name); setSavedName(detail.deck.name); setDeckCards(detail.cards ?? []); setPendingIds((detail.cards ?? []).map((item) => item.card_id)); } setLoading(false); }).catch((caught) => { if (live) { setError(caught instanceof Error ? caught.message : "デッキを読み込めませんでした"); setLoading(false); } }); return () => { live = false; }; }, []);
  const dirty = pendingIds.join("|") !== deckCards.map((item) => item.card_id).join("|") || name !== savedName;
  const visibleCards = cards.filter((card) => (typeFilter === "all" || card.card_type === typeFilter) && `${card.title} ${card.description ?? ""}`.toLocaleLowerCase("ja").includes(query.trim().toLocaleLowerCase("ja")));
  const run = async (operation: () => Promise<void>) => { setBusy(true); setError(""); setFeedback(""); try { await operation(); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした"); } finally { setBusy(false); } };
  const createDeck = () => void run(async () => { const result = await readJson<{ deck: DeckSummary }>(await fetch("/api/decks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "My Deck" }) })); setDecks((current) => [result.deck, ...current]); setSelected(result.deck.id); setName(result.deck.name); setSavedName(result.deck.name); setDeckCards([]); setPendingIds([]); });
  const save = () => void run(async () => { const nameResult = await readJson<{ deck: DeckSummary }>(await fetch(`/api/decks/${selected}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) })); await readJson(await fetch(`/api/decks/${selected}/cards`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardIds: pendingIds }) })); setName(nameResult.deck.name); setSavedName(nameResult.deck.name); await loadDeck(selected); setFeedback("デッキを保存しました。"); });
  const deleteDeck = () => void run(async () => { const deck = decks.find((item) => item.id === selected); if (!deck || !window.confirm(`「${deck.name}」を削除しますか？`)) return; await readJson(await fetch(`/api/decks/${selected}`, { method: "DELETE" })); const nextDecks = decks.filter((item) => item.id !== selected); setDecks(nextDecks); setSelected(nextDecks[0]?.id ?? ""); if (nextDecks[0]) await loadDeck(nextDecks[0].id); else { setDeckCards([]); setPendingIds([]); setName(""); setSavedName(""); } });
  const toggleCard = (card: CardRecord) => {
    if (card.card_type === "part" && card.parent_card_id) return;
    const attachedParts = cards.filter((candidate) => candidate.card_type === "part" && candidate.parent_card_id === card.id).map((candidate) => candidate.id);
    setPendingIds((current) => current.includes(card.id) ? current.filter((id) => id !== card.id && !attachedParts.includes(id)) : current.length + attachedParts.filter((id) => !current.includes(id)).length >= 20 ? current : [...current, card.id, ...attachedParts.filter((id) => !current.includes(id))]);
  };
  const moveCard = (index: number, offset: number) => setPendingIds((current) => { const next = [...current]; const target = index + offset; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const addByDrop = (event: React.DragEvent) => { event.preventDefault(); setDragId(null); const id = event.dataTransfer.getData("text/card-id"); const card = cards.find((item) => item.id === id); if (card) toggleCard(card); };
  const mappedDeckCards = pendingIds.map((id) => cards.find((card) => card.id === id) ?? deckCards.find((row) => row.card_id === id)?.card ?? null).filter((card): card is CardRecord => Boolean(card));
  const actionCount = mappedDeckCards.filter((card) => card.card_type === "action").length;
  const supportCount = mappedDeckCards.filter((card) => card.card_type === "support").length;
  const partCount = mappedDeckCards.filter((card) => card.card_type === "part").length;

  if (loading) return <div className="empty-state"><span className="loading-ring" /><h2>編成卓を準備しています</h2><p>デッキと所有カードを読み込んでいます。</p></div>;
  if (!decks.length) return <div className="deck-empty-shell"><EmptyPanel icon={<Layers3 size={25} />} title="デッキを作成しましょう" description="カードを組み合わせて、自分の戦い方を準備します。" action="デッキを作成" onAction={createDeck} />{error && <p className="form-feedback error-text" role="alert">{error}</p>}<button className="text-button" onClick={() => navigate("BINDER")}>先にカードを見る <ArrowRight size={14} /></button></div>;

  return <section className="deck-builder">
    <div className="deck-topbar"><label className="deck-select-field"><span>編集中のデッキ</span><select value={selected} onChange={(event) => { const id = event.target.value; setSelected(id); void loadDeck(id).catch((caught) => setError(caught.message)); }}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label><button className="secondary-button" onClick={createDeck} disabled={busy}><Plus size={15} />新規デッキ</button><button className="quiet-danger" onClick={deleteDeck} disabled={busy}><Trash2 size={15} />削除</button></div>
    <div className="deck-workbench">
      <section className="owned-library"><div className="section-title-row"><div><span className="overline">OWNED CARDS</span><h2>カードを選ぶ</h2></div><span className="count-pill">{cards.length}枚</span></div>
        <div className="library-controls"><label className="search-field"><Search size={16} /><span className="sr-only">所有カードを検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="カード名で検索" /></label><select aria-label="カード種別" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">すべて</option><option value="action">アクション</option><option value="support">サポート</option><option value="part">パーツ</option></select></div>
        {cards.length === 0 ? <div className="mini-empty"><BookOpen size={19} /><p>編成できるカードがありません。</p><button className="text-button" onClick={() => navigate("SCOUT")}>カードをスカウト <ArrowRight size={14} /></button></div> : <div className="library-card-list">{visibleCards.map((card) => { const inDeck = pendingIds.includes(card.id); const autoPart = card.card_type === "part" && Boolean(card.parent_card_id); return <article key={card.id} className={`library-card-row ${inDeck ? "in-deck" : ""}`} draggable={!autoPart} onDragStart={(event) => { if (autoPart) return; setDragId(card.id); event.dataTransfer.setData("text/card-id", card.id); }} onDragEnd={() => setDragId(null)}><div className="library-thumb"><CardDisplay card={card} size="small" showStats={false} /></div><div className="library-card-copy"><b>{card.title}</b><small>{card.card_type === "action" ? "アクション" : card.card_type === "support" ? "サポート" : "パーツ"}{autoPart ? " · 親カード装着時に自動追加" : ""}</small><span>HP {card.hp} · ATK {card.atk} · DEF {card.shield}</span></div><button className={inDeck ? "selection-button selected" : "selection-button"} aria-pressed={inDeck} disabled={busy || autoPart || (!inDeck && pendingIds.length >= 20)} onClick={() => toggleCard(card)}>{autoPart ? "自動" : inDeck ? <><Check size={14} />選択中</> : <><Plus size={14} />追加</>}</button></article>; })}{visibleCards.length === 0 && <p className="mini-empty">条件に合うカードがありません。</p>}</div>}
      </section>
      <section className={`deck-preview-panel ${dragId ? "drop-active" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={addByDrop}>
        <div className="section-title-row"><div><span className="overline">DECK LOADOUT</span><h2>編成プレビュー</h2></div><span className={`save-state ${dirty ? "unsaved" : "saved"}`}><i />{dirty ? "未保存の変更" : "保存済み"}</span></div>
        <label className="deck-name-field"><span>デッキ名</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <div className="deck-composition"><span><b>{pendingIds.length}</b> / 20 枚</span><i /><span>アクション {actionCount}</span><span>サポート {supportCount}</span><span>パーツ {partCount}</span><small>関連パーツは親カード選択時に自動で含まれます</small></div>
        <div className="deck-slot-list" aria-label="デッキカードの並び順">
          {Array.from({ length: 20 }, (_, index) => { const card = mappedDeckCards[index]; return <div key={card?.id ?? `slot-${index}`} className={`deck-loadout-slot ${card ? "filled" : "empty"}`}>
            <span className="slot-number">{String(index + 1).padStart(2, "0")}</span>
            {card ? <><div className="slot-thumb"><CardDisplay card={card} size="small" showStats={false} /></div><div className="slot-copy"><b>{card.title}</b><small>{card.card_type === "part" ? "パーツ" : card.card_type === "support" ? "サポート" : "アクション"}</small></div><div className="slot-actions"><button onClick={() => moveCard(index, -1)} disabled={index === 0} aria-label={`${card.title}を上へ`}><ArrowUp size={14} /></button><button onClick={() => moveCard(index, 1)} disabled={index === mappedDeckCards.length - 1} aria-label={`${card.title}を下へ`}><ArrowDown size={14} /></button><button onClick={() => setPendingIds((current) => current.filter((id) => id !== card.id))} aria-label={`${card.title}をデッキから外す`}><X size={15} /></button></div></> : <span className="slot-placeholder">カードを選ぶとここに追加されます</span>}
          </div>; })}
        </div>
        <div className="deck-save-bar"><span>{pendingIds.length >= 20 ? "デッキは上限枚数です" : `あと ${20 - pendingIds.length} 枚追加できます`}</span><button className="primary-button" onClick={save} disabled={busy || !dirty || !name.trim()}>{busy ? "保存中…" : "変更を保存"}<Check size={15} /></button></div>
        {error && <p className="form-feedback error-text" role="alert">{error}</p>}{feedback && <p className="form-feedback" role="status">{feedback}</p>}
      </section>
    </div>
  </section>;
}

function MatchFlow({ navigate }: { navigate: (section: string) => void }) {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [rows, setRows] = useState<DeckCard[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [battle, setBattle] = useState<{ id: string; status: string; turn: number; active_player_id: string | null; winner_player_id: string | null; state_version: number } | null>(null);
  const [battleState, setBattleState] = useState<BattleSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [acting, setActing] = useState(false);
  const [matchMessage, setMatchMessage] = useState("");
  const [events, setEvents] = useState<BattleEventView[]>([]);
  const [queueExpiresAt, setQueueExpiresAt] = useState<number | null>(null);

  const loadDecks = async (deckId?: string) => {
    const result = await readJson<{ decks: DeckSummary[] }>(await fetch("/api/decks"));
    setDecks(result.decks ?? []);
    const next = deckId || selected || result.decks?.[0]?.id || "";
    setSelected(next);
    if (!next) { setRows([]); return; }
    const deckResult = await readJson<{ cards: DeckCard[] }>(await fetch(`/api/decks/${next}`));
    setRows(deckResult.cards ?? []);
  };
  useEffect(() => { let live = true; const initialize = async () => { const [deckResult, queueResult, battleResult] = await Promise.all([readJson<{ decks: DeckSummary[] }>(await fetch("/api/decks")), readJson<{ entry: { status: string; expires_at: string } | null }>(await fetch("/api/matchmaking")), readJson<{ battles: Array<{ battles: BattleSnapshot["battle"] | BattleSnapshot["battle"][] | null }> }>(await fetch("/api/battles"))]); if (!live) return; setDecks(deckResult.decks ?? []); const next = deckResult.decks?.[0]?.id ?? ""; setSelected(next); if (next) { const details = await readJson<{ cards: DeckCard[] }>(await fetch(`/api/decks/${next}`)); if (live) setRows(details.cards ?? []); } const recent = (battleResult.battles ?? []).map((row) => Array.isArray(row.battles) ? row.battles[0] : row.battles).find((item) => item?.status === "active"); if (recent) setBattle(recent); else if (queueResult.entry?.status === "queued") { setQueueing(true); setQueueExpiresAt(new Date(queueResult.entry.expires_at).getTime()); } if (live) setLoading(false); }; initialize().catch((caught) => { if (live) { setError(caught instanceof Error ? caught.message : "読み込めませんでした"); setLoading(false); } }); return () => { live = false; }; }, []);

  useEffect(() => {
    if (!queueing || battle) return;
    let live = true;
    const poll = async () => {
      if (queueExpiresAt !== null && Date.now() >= queueExpiresAt) { setQueueing(false); setError("制限時間内に対戦相手が見つかりませんでした。もう一度お試しください。"); return; }
      try {
        await fetch("/api/battles", { method: "POST" });
        const result = await readJson<{ battles: Array<{ battles: BattleSnapshot["battle"] | BattleSnapshot["battle"][] | null }> }>(await fetch("/api/battles"));
        const found = result.battles?.map((row) => Array.isArray(row.battles) ? row.battles[0] : row.battles).find((item) => item && ["active", "waiting"].includes(item.status));
        if (live && found) { setBattle(found); setQueueing(false); setQueueExpiresAt(null); setMatchMessage("対戦相手が見つかりました。盤面を同期しています。"); }
      } catch { if (live) setError("接続を確認できません。再接続を試みています。"); }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => { live = false; window.clearInterval(timer); };
  }, [queueing, battle, queueExpiresAt]);

  useEffect(() => {
    if (!battle) return;
    let live = true;
    const pollState = async () => {
      try {
        setSyncing(true);
        const [stateResponse, eventResponse] = await Promise.all([fetch(`/api/battles/${battle.id}/state`), fetch(`/api/battles/${battle.id}/events`)]);
        const stateData = await readJson<{ state: BattleSnapshot }>(stateResponse);
        const eventData = await readJson<{ events: BattleEventView[] }>(eventResponse);
        if (live) { setBattleState(stateData.state); setEvents(eventData.events ?? []); setBattle(stateData.state.battle); setMatchMessage(""); setError(""); }
      } catch { if (live) setError("対戦状態を再同期しています。"); }
      finally { if (live) setSyncing(false); }
    };
    void pollState();
    const timer = window.setInterval(() => void pollState(), 3000);
    return () => { live = false; window.clearInterval(timer); };
  }, [battle?.id]);

  const startMatch = async () => {
    if (!selected || queueing) return;
    setError(""); setMatchMessage("");
    try { const result = await readJson<{ entry: { expires_at: string } }>(await fetch("/api/matchmaking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deckId: selected }) })); setQueueExpiresAt(new Date(result.entry.expires_at).getTime()); setQueueing(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "マッチングを開始できませんでした。"); }
  };
  const cancelMatch = async () => {
    try { await readJson(await fetch("/api/matchmaking", { method: "DELETE" })); setQueueing(false); setQueueExpiresAt(null); setMatchMessage("マッチングをキャンセルしました。"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "キャンセルできませんでした。"); }
  };
  const endTurn = async () => {
    if (!battle || !battleState || battle.active_player_id !== battleState.currentPlayerId || acting) return;
    setActing(true); setError("");
    try { await readJson(await fetch(`/api/battles/${battle.id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actionId: crypto.randomUUID(), expectedVersion: battle.state_version, type: "end_turn" }) })); setMatchMessage("ターン終了を送信しました。盤面を同期しています。"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "ターンを終了できませんでした。"); }
    finally { setActing(false); }
  };
  const selectedDeckCards = rows.map((row) => row.card).filter((card): card is CardRecord => Boolean(card));
  const actionCount = rows.filter((row) => row.role === "action").length;
  if (loading) return <div className="empty-state"><span className="loading-ring" /><h2>アリーナを準備しています</h2><p>デッキを確認しています。</p></div>;
  if (!decks.length) return <div className="arena-empty"><EmptyPanel icon={<Swords size={25} />} title="対戦の前にデッキを作成" description="アクションカードを選んで、バトルの準備をしましょう。" action="デッキ編成へ" onAction={() => navigate("DECK")} /></div>;

  if (!battle) return <section className="arena-lobby">
    <div className="arena-lobby-head"><div><span className="overline">BATTLE ARENA</span><h2>出撃デッキを選ぶ</h2><p>準備ができたら、アリーナで対戦相手を探します。</p></div><div className="arena-status-badge"><span className={queueing ? "connection-dot searching" : "connection-dot"} />{queueing ? "対戦相手を検索中" : "待機中"}</div></div>
    <div className="arena-deck-picker"><label><span>使用するデッキ</span><select value={selected} disabled={queueing} onChange={(event) => void loadDecks(event.target.value).catch((caught) => setError(caught.message))}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label><button className="text-button" onClick={() => navigate("DECK")} disabled={queueing}>デッキを編集 <ArrowRight size={14} /></button></div>
    <div className="prebattle-summary"><div className="prebattle-title"><span>YOUR LOADOUT</span><b>{selectedDeckCards.length}枚のカード</b></div><div className="prebattle-cards">{selectedDeckCards.slice(0, 5).map((card) => <div className="prebattle-card" key={card.id}><CardDisplay card={card} size="small" showStats={false} /><b>{card.title}</b></div>)}{selectedDeckCards.length === 0 && <p className="mini-empty">このデッキにカードがありません。</p>}</div><p className="deck-requirement"><Shield size={15} />アクションカード {actionCount} 枚</p></div>
    {queueing ? <div className="match-search-state" role="status" aria-live="polite"><span className="match-radar"><Swords size={19} /></span><div><b>アリーナを検索しています</b><p>対戦相手が見つかると、ここに対戦盤面を表示します。</p></div><button className="secondary-button" onClick={() => void cancelMatch()}>検索をキャンセル</button></div> : <button className="primary-button arena-start-button" onClick={() => void startMatch()} disabled={!selected || actionCount === 0}><Swords size={17} />マッチング開始 <ArrowRight size={16} /></button>}
    {actionCount === 0 && <p className="inline-hint">対戦するにはデッキにアクションカードが必要です。<button onClick={() => navigate("DECK")}>デッキを編成</button></p>}
    {error && <p className="form-feedback error-text" role="alert">{error}</p>}{matchMessage && <p className="form-feedback" role="status">{matchMessage}</p>}
  </section>;

  const state = battleState;
  const opponentCards = state?.cards.filter((card) => card.playerId !== state.currentPlayerId) ?? [];
  const ownCards = state?.cards.filter((card) => card.playerId === state.currentPlayerId) ?? [];
  const ownTurn = Boolean(state && battle.active_player_id === state.currentPlayerId && battle.status === "active");
  const turnLabel = battle.status === "finished" ? (battle.winner_player_id === state?.currentPlayerId ? "勝利" : "試合終了") : syncing ? "同期中" : ownTurn ? "あなたのターン" : "相手のターン";
  return <section className="battle-live">
    <div className="battle-live-header"><div><span className="overline">LIVE MATCH</span><h2>バトルアリーナ</h2><p>試合 #{battle.id.slice(0, 8)}</p></div><div className="battle-turn-chip"><span className={`connection-dot ${syncing ? "searching" : ""}`} />{turnLabel}<small>TURN {battle.turn}</small></div></div>
    <div className="battle-board">
      <div className="battle-side-title opponent-side"><span className="battle-avatar">敵</span><div><b>対戦相手</b><small>{opponentCards.length ? "フィールド" : "カード情報を待っています"}</small></div><span className="side-indicator">OPPONENT</span></div>
      <div className="battle-side-cards">{opponentCards.length ? opponentCards.map((card) => <BattleFieldCard key={card.instanceId} card={card} battleId={battle.id} />) : <div className="battle-empty"><span>VS</span><p>{state ? "相手のフィールドカードはありません" : "盤面を同期しています"}</p></div>}</div>
      <div className="battle-midline"><span>TURN {battle.turn}</span><b>{battle.status === "finished" ? "FINISHED" : ownTurn ? "YOUR TURN" : "OPPONENT TURN"}</b><span>AP {ownCards[0]?.ap ?? "—"}</span></div>
      <div className="battle-side-cards own-side-cards">{ownCards.length ? ownCards.map((card) => <BattleFieldCard key={card.instanceId} card={card} battleId={battle.id} />) : <div className="battle-empty"><Layers3 size={20} /><p>{state ? "自分のフィールドカードはありません" : "盤面を同期しています"}</p></div>}</div>
      <div className="battle-side-title own-side"><span className="battle-avatar">自</span><div><b>あなた</b><small>{ownCards.length} 枚がフィールドにいます</small></div><span className="side-indicator">YOU</span></div>
    </div>
    <div className="battle-lower-grid"><section className="battle-log-panel"><div className="section-title-row"><div><span className="overline">BATTLE LOG</span><h3>行動ログ</h3></div><Clock3 size={17} /></div>{events.length ? <ol className="battle-event-list">{events.slice(-8).reverse().map((event) => <li key={event.id}><span>{event.sequence}</span><div><b>{eventLabel(event.event_type)}</b><small>{event.created_at ? new Date(event.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : ""}</small></div></li>)}</ol> : <p className="log-empty">試合のイベントがここに表示されます。</p>}</section>
      <aside className="battle-command-panel"><div className="turn-status"><span className="overline">TURN STATUS</span><b>{battle.status === "finished" ? turnLabel : ownTurn ? "あなたの行動番です" : "相手の行動を待っています"}</b><p>APはサーバーの対戦状態と同期しています。</p></div><div className="ap-meter"><span>AP</span><b>{ownCards[0]?.ap ?? "—"}</b><small>/ {ownCards[0]?.maxAp ?? "—"}</small></div><button className="battle-end-button" onClick={() => void endTurn()} disabled={!ownTurn || acting || syncing}>{acting ? "送信中…" : "ターンを終了"}<ArrowRight size={16} /></button><p className="command-note">スキル操作は対戦エンジン対応後に有効になります。</p></aside>
    </div>
    {(error || matchMessage) && <p className={`form-feedback ${error ? "error-text" : ""}`} role={error ? "alert" : "status"}>{error || matchMessage}</p>}
  </section>;
}

type BattleSnapshot = { currentPlayerId: string; battle: { id: string; status: string; turn: number; active_player_id: string | null; winner_player_id: string | null; state_version: number }; cards: Array<{ id: string; source_card_id: string | null; instanceId: string; playerId: string; title: string; hp: number; maxHp: number; atk: number; def: number; speed: number; ap: number; maxAp: number; skills: unknown[]; zone: string }> };
type BattleEventView = { id: string; sequence: number; event_type: string; created_at: string };
function eventLabel(type: string) { const labels: Record<string, string> = { turn_started: "ターン開始", turn_ended: "ターン終了", action_accepted: "アクション受付", damage_applied: "ダメージ", heal_applied: "回復", battle_finished: "試合終了", actor_defeated: "カードが倒れた", effect_skipped: "効果スキップ" }; return labels[type] ?? type.replaceAll("_", " "); }
function BattleFieldCard({ card, battleId }: { card: BattleSnapshot["cards"][number]; battleId: string }) {
  const displayCard: DisplayCard = { id: card.source_card_id ?? card.id, title: card.title, card_type: "action", hp: card.hp, atk: card.atk, shield: card.def, speed: card.speed, generation_status: "ready" };
  const hpPercent = card.maxHp > 0 ? Math.max(0, Math.min(100, card.hp / card.maxHp * 100)) : 0;
  return <article className="battle-field-card"><CardDisplay card={displayCard} imageSrc={`/api/battles/${encodeURIComponent(battleId)}/cards/${encodeURIComponent(card.id)}/image`} size="small" showStats={false} /><div className="battle-unit-info"><b>{card.title}</b><div className="hp-meter" aria-label={`HP ${card.hp} / ${card.maxHp}`}><span style={{ width: `${hpPercent}%` }} /><small>HP {card.hp} / {card.maxHp}</small></div><div className="battle-unit-stats"><span>ATK <b>{card.atk}</b></span><span>DEF <b>{card.def}</b></span><span>SPD <b>{card.speed}</b></span></div></div></article>;
}

function NotificationsPanel() {
  const [items, setItems] = useState<Array<{ id: string; title: string; body: string | null; read_at: string | null; created_at: string }>>([]);
  const [error, setError] = useState("");
  const unread = items.filter((item) => !item.read_at).length;
  const load = async () => { const result = await readJson<{ notifications: typeof items }>(await fetch("/api/notifications")); setItems(result.notifications ?? []); };
  useEffect(() => { let live = true; load().catch((caught) => { if (live) setError(caught.message ?? "通知を取得できませんでした。"); }); return () => { live = false; }; }, []);
  const mark = async (id?: string) => { try { await readJson(await fetch(id ? `/api/notifications/${id}` : "/api/notifications/read-all", { method: id ? "PATCH" : "POST" })); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "更新できませんでした。"); } };
  return <section className="notifications-panel"><div className="panel-heading"><div><span className="overline">INBOX</span><h2>未読 {unread} 件</h2></div><button className="secondary-button" onClick={() => void mark()} disabled={!unread}>すべて既読</button></div>{error && <p className="form-feedback error-text" role="alert">{error}</p>}{!items.length ? <EmptyPanel icon={<Bell size={24} />} title="通知はありません" description="新しいお知らせが届くとここに表示されます。" /> : <div className="notification-list">{items.map((item) => <article className={`notification-item ${item.read_at ? "read" : "unread"}`} key={item.id}><span className="notification-mark"><Bell size={16} /></span><div><b>{item.title}</b><p>{item.body || ""}</p><small>{new Date(item.created_at).toLocaleString("ja-JP")}</small></div>{!item.read_at && <button className="secondary-button" onClick={() => void mark(item.id)}>既読にする</button>}</article>)}</div>}</section>;
}

function SettingsPanel({ user }: { user: User }) {
  const [form, setForm] = useState({ display_name: user.name ?? "", timezone: "Asia/Tokyo", locale: "ja-JP", notifications_enabled: true });
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => { let live = true; fetch("/api/settings").then((response) => readJson<{ settings: typeof form }>(response)).then((result) => { if (live) { setForm((current) => ({ ...current, ...result.settings })); setState("ready"); } }).catch((caught) => { if (live) { setMessage(caught.message ?? "設定を取得できませんでした。"); setState("error"); } }); return () => { live = false; }; }, []);
  const save = async () => { setState("saving"); setMessage(""); try { const result = await readJson<{ settings: typeof form }>(await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(form) })); setForm((current) => ({ ...current, ...result.settings })); setMessage("設定を保存しました。"); setState("saved"); } catch (caught) { setMessage(caught instanceof Error ? caught.message : "保存できませんでした。"); setState("error"); } };
  return <section className="settings-panel"><label>表示名<input value={form.display_name} maxLength={80} disabled={state === "loading" || state === "saving"} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label><label>タイムゾーン<select value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })}><option>Asia/Tokyo</option><option>UTC</option><option>America/Los_Angeles</option></select></label><label>言語<select value={form.locale} onChange={(event) => setForm({ ...form, locale: event.target.value })}><option value="ja-JP">日本語</option><option value="en-US">English</option></select></label><label className="toggle-row"><span>通知を受け取る</span><input type="checkbox" checked={form.notifications_enabled} onChange={(event) => setForm({ ...form, notifications_enabled: event.target.checked })} /></label><button className="primary-button" onClick={() => void save()} disabled={state === "loading" || state === "saving" || !form.display_name.trim()}>{state === "saving" ? "保存中…" : "設定を保存"}<Check size={15} /></button>{message && <p className={`form-feedback ${state === "error" ? "error-text" : ""}`} role={state === "error" ? "alert" : "status"}>{message}</p>}</section>;
}

function ProfilePanel({ user }: { user: User }) {
  const [username, setUsername] = useState(user.name ?? "プレイヤー");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => { let live = true; fetch("/api/profile").then((response) => readJson<{ profile: { username: string } }>(response)).then((result) => { if (live) { setUsername(result.profile.username); setStatus("ready"); } }).catch((caught) => { if (live) { setMessage(caught.message ?? "プロフィールを取得できませんでした。"); setStatus("error"); } }); return () => { live = false; }; }, []);
  const save = async () => { setStatus("saving"); setMessage(""); try { const result = await readJson<{ profile: { username: string } }>(await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ username }) })); setUsername(result.profile.username); setMessage("プロフィールを保存しました。"); setStatus("saved"); } catch (caught) { setMessage(caught instanceof Error ? caught.message : "保存できませんでした。"); setStatus("error"); } };
  return <section className="profile-panel"><div className="profile-identity"><span className="avatar profile-avatar">{username.slice(0, 1).toUpperCase()}</span><div><h2>{username}</h2><p>{user.email ?? "メールアドレス未取得"}</p></div></div><div className="profile-rows"><div><span>表示名</span><label className="profile-edit"><input value={username} maxLength={80} disabled={status === "loading" || status === "saving"} onChange={(event) => setUsername(event.target.value)} /><button className="secondary-button" disabled={status === "loading" || status === "saving" || !username.trim()} onClick={() => void save()}>{status === "saving" ? "保存中…" : "保存"}</button></label></div><div><span>ログイン方法</span><b>{user.provider ?? "認証済み"}</b></div><div><span>アカウント状態</span><b>利用中</b></div></div>{message && <p className={`form-feedback ${status === "error" ? "error-text" : ""}`} role={status === "error" ? "alert" : "status"}>{message}</p>}</section>;
}
