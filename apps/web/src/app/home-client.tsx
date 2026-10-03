/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, BookOpen, Check, ChevronRight,
  CircleHelp, ImagePlus, Layers3, LogOut, Menu, Plus, RefreshCw, Search,
  Settings, Shield, Sparkles, Swords, Trash2, UserRound, X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { CardDisplay, type DisplayCard } from "@/components/card-display";
import { expandDeckCardIds, type DeckCardCandidate } from "@/lib/decks/normalize";

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
  trial_public?: boolean;
  created_at: string;
  skills?: unknown[];
  support_definition?: { effects?: unknown[]; timing?: string; target_scope?: string } | null;
};
type DeckSummary = { id: string; name: string };
type DeckCard = { id: string; card_id: string; slot_index: number; role: string; card: CardRecord | null };
const selectableDeckIds = (rows: DeckCard[]) => rows.filter((item) => item.card?.card_type !== "part").map((item) => item.card_id);

function partPresentation(part: CardRecord, parent?: CardRecord | null) {
  const skill = Array.isArray(part.skills) ? part.skills.find((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))) : undefined;
  const skillName = typeof skill?.name === "string" && skill.name.trim() ? skill.name : "未設定の技";
  const effect = typeof skill?.description === "string" && skill.description.trim() ? skill.description : "効果未設定";
  return { card: { ...part, title: `パーツカード: ${skillName}: ${effect}` }, imageSrc: parent ? `/api/cards/${encodeURIComponent(parent.id)}/image` : undefined };
}
function deckCardTitle(card: CardRecord, catalog: CardRecord[]) {
  return card.card_type === "part" ? partPresentation(card, catalog.find((candidate) => candidate.id === card.parent_card_id)).card.title : card.title;
}
function deckCardImageSrc(card: CardRecord, catalog: CardRecord[]) {
  return card.card_type === "part" ? partPresentation(card, catalog.find((candidate) => candidate.id === card.parent_card_id)).imageSrc : undefined;
}

function OpeningOverlay() {
  const [visible, setVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (window.sessionStorage.getItem("lll-opening-played") === "1") return;
    setVisible(true);
  }, []);

  const finish = () => {
    window.sessionStorage.setItem("lll-opening-played", "1");
    setVisible(false);
  };

  if (!visible) return null;
  return <div className="opening-overlay" role="dialog" aria-label="LLL オープニング" onClick={finish}>
    <video ref={videoRef} className="opening-video" autoPlay muted playsInline preload="auto" onEnded={finish} onError={finish}>
      <source src="/Opening.MP4" type="video/mp4" />
    </video>
    <button className="opening-skip" onClick={(event) => { event.stopPropagation(); finish(); }}>SKIP</button>
  </div>;
}

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
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const immersiveBattleId = pathname.startsWith("/battle/match/") ? decodeURIComponent(pathname.slice("/battle/match/".length)) : undefined;
  const pathToSection: Record<string, string> = { "/": "HOME", "/scout": "SCOUT", "/binder": "BINDER", "/decks": "DECK", "/battle": "BATTLE", "/profile": "PROFILE", "/notifications": "NOTIFICATIONS", "/settings": "SETTINGS", "/help": "HELP" };
  const active = immersiveBattleId ? "BATTLE" : pathToSection[pathname] ?? "HELP";
  const displayName = user.name?.trim() || "プレイヤー";
  useEffect(() => {
    setIsNavigating(false);
    if (navigationTimer.current) {
      clearTimeout(navigationTimer.current);
      navigationTimer.current = null;
    }
    return () => { if (navigationTimer.current) clearTimeout(navigationTimer.current); };
  }, [pathname]);
  const navigateTo = (path: string) => {
    if (path === pathname) { setMenuOpen(false); return; }
    setIsNavigating(true);
    setMenuOpen(false);
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    navigationTimer.current = setTimeout(() => { router.push(path); navigationTimer.current = null; }, 150);
  };
  const navigate = (section: string) => {
    navigateTo(sectionPaths[section] ?? "/");
  };

  if (immersiveBattleId) return <><OpeningOverlay /><main className={`immersive-match-shell ${isNavigating ? "is-navigating" : ""}`}><div className="game-frame game-frame-immersive"><ModulePanel active="BATTLE" user={user} navigate={navigate} navigateTo={navigateTo} immersiveBattleId={immersiveBattleId} /></div></main></>;

  return <><OpeningOverlay /><main className={`app-shell ${active === "BATTLE" ? "app-shell-battle" : ""} ${isNavigating ? "is-navigating" : ""}`}>
    <div className="game-frame">
      <header className="topbar">
        <button className="brand-lockup" onClick={() => navigate("HOME")} aria-label="LLL ホームへ">
          <Image src="/lll-logo.jpg" alt="LLL" width={58} height={32} priority />
        </button>
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
      <section className="page-wrap">
        {active === "HOME" ? <HomePanel userName={displayName} navigate={navigate} navigateTo={navigateTo} /> : <ModulePanel active={active} user={user} navigate={navigate} navigateTo={navigateTo} />}
      </section>
    </div>
  </main></>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="overline">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>;
}

function HomePanel({ userName, navigate, navigateTo }: { userName: string; navigate: (section: string) => void; navigateTo: (path: string) => void }) {
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
  const readyCards = cards.filter((card) => card.card_type !== "part" && card.generation_status === "ready");
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
        {status === "loading" ? <div className="home-loading"><span className="loading-ring" />コレクションを読み込み中</div> : latestCard ? <div className="featured-card"><button className="featured-card-art" onClick={() => navigateTo(`/cards/${latestCard.id}`)} aria-label={`${latestCard.title}の詳細を見る`}><CardDisplay card={latestCard} size="small" /></button><div><span className="eyebrow-chip">最近のカード</span><h3>{latestCard.title}</h3><p>あなたのコレクションに加わりました。</p><div className="mini-stat-row"><span>HP <b>{latestCard.hp}</b></span><span>ATK <b>{latestCard.atk}</b></span></div><button className="text-button" onClick={() => navigate("BINDER")}>バインダーを開く <ArrowRight size={14} /></button></div></div> : <div className="dashboard-empty"><BookOpen size={22} /><div><b>バインダーはまだ空です</b><p>最初のカードをスカウトして、コレクションを始めましょう。</p></div><button className="secondary-button" onClick={() => navigate("SCOUT")}>スカウトする <ArrowRight size={15} /></button></div>}
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

function ModulePanel({ active, user, navigate, navigateTo, immersiveBattleId }: { active: string; user: User; navigate: (section: string) => void; navigateTo: (path: string) => void; immersiveBattleId?: string }) {
  const [title, description] = labelMap[active] ?? labelMap.HELP;
  if (immersiveBattleId) return <MatchFlow navigate={navigate} navigateTo={navigateTo} immersiveBattleId={immersiveBattleId} />;
  return <div className={`module-panel module-${active.toLowerCase()}`}>
    <button className="back-link" onClick={() => navigate("HOME")}><ArrowLeft size={15} />ホーム</button>
    {active !== "SCOUT" && <PageHeading eyebrow={`LLL / ${active}`} title={title} description={description} />}
    {active === "SCOUT" ? <ScoutPanel navigate={navigate} /> : active === "BINDER" ? <BinderPanel navigateTo={navigateTo} /> : active === "DECK" ? <DeckPanel navigate={navigate} /> : active === "BATTLE" ? <MatchFlow navigate={navigate} navigateTo={navigateTo} /> : active === "PROFILE" ? <ProfilePanel user={user} /> : active === "NOTIFICATIONS" ? <NotificationsPanel /> : active === "SETTINGS" ? <SettingsPanel user={user} /> : <EmptyPanel icon={<CircleHelp size={25} />} title="ヘルプを準備しています" description="カードの作り方とバトルの遊び方を順次追加します。" />}
  </div>;
}

function EmptyPanel({ icon, title, description, action, onAction }: { icon: React.ReactNode; title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-state-icon">{icon}</span><h2>{title}</h2><p>{description}</p>{action && onAction && <button className="secondary-button" onClick={onAction}>{action}<ArrowRight size={15} /></button>}</div>;
}

function BinderSkeletonGrid() {
  return <div className="binder-grid binder-skeleton-grid" aria-label="カードを読み込み中">
    {Array.from({ length: 6 }, (_, index) => <article className="binder-skeleton-item" key={index}><div className="skeleton-card-art" /><div className="skeleton-line skeleton-line-title" /><div className="skeleton-line skeleton-line-copy" /><div className="skeleton-line skeleton-line-copy short" /></article>)}
  </div>;
}

function BinderPanel({ navigateTo }: { navigateTo: (path: string) => void }) {
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "compact">("grid");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = async () => {
    setState("loading");
    try { const result = await readJson<{ cards: CardRecord[] }>(await fetch("/api/cards")); setCards(result.cards ?? []); setState("ready"); }
    catch { setState("error"); }
  };
  useEffect(() => { void load(); }, []);
  const visibleCards = useMemo(() => {
    // パーツは親アクションから自動編成されるため、バインダーでは非表示にする。
    // APIから取得した `cards` は変更せず、データ自体はそのまま保持する。
    const binderCards = cards.filter((card) => card.card_type !== "part");
    const filtered = binderCards.filter((card) => (typeFilter === "all" || card.card_type === typeFilter)
      && (tierFilter === "all" || card.scout_tier === tierFilter)
      && (statusFilter === "all" || card.generation_status === statusFilter)
      && `${card.title} ${card.description ?? ""}`.toLocaleLowerCase("ja").includes(query.trim().toLocaleLowerCase("ja")));
    return filtered.sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "ja") : sort === "total" ? (b.hp + b.atk + b.shield + b.speed) - (a.hp + a.atk + a.shield + a.speed) : b.created_at.localeCompare(a.created_at));
  }, [cards, typeFilter, tierFilter, statusFilter, query, sort]);
  const removeCard = async (card: CardRecord) => {
    const impact = card.card_type === "action" ? "\nこのアクションに装着するパーツも削除され、編成中のカードから外れます。" : "\n編成中のカードからも外れます。";
    if (!window.confirm(`「${card.title}」をバインダーから捨てますか？${impact}\nこの操作は取り消せません。`)) return;
    setDeleting(card.id); setMessage("");
    try { await readJson(await fetch(`/api/cards/${card.id}`, { method: "DELETE" })); setCards((current) => current.filter((item) => item.id !== card.id && item.parent_card_id !== card.id)); setMessage("カードを捨てました。編成中のカードからも外れています。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "削除できませんでした。"); }
    finally { setDeleting(null); }
  };
  const toggleTrialPublic = async (card: CardRecord) => {
    const next = !card.trial_public;
    if (next && !window.confirm(`「${card.title}」を試し切り相手として公開しますか？\n公開される内容：カード名・説明・能力値・カード画像。\n作者名・アカウントIDは表示されません。公開はいつでも取り消せます。`)) return;
    setSharing(card.id); setMessage("");
    try { const result = await readJson<{ card: { trial_public: boolean } }>(await fetch(`/api/cards/${card.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trialPublic: next }) })); setCards((current) => current.map((item) => item.id === card.id ? { ...item, trial_public: result.card.trial_public } : item)); setMessage(next ? "カードを試し切り相手として公開しました。" : "カードを非公開に戻しました。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "公開設定を変更できませんでした。"); }
    finally { setSharing(null); }
  };
  const resetFilters = () => { setQuery(""); setTypeFilter("all"); setTierFilter("all"); setStatusFilter("all"); };
  const filterKey = `${query}|${typeFilter}|${tierFilter}|${statusFilter}|${sort}|${view}`;

  return <section className="binder-page">
    <div className="binder-toolbar">
      <label className="search-field"><Search size={17} /><span className="sr-only">カードを検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="カード名・説明で検索" /></label>
      <div className="binder-controls">
        <label><span>種別</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">すべて</option><option value="action">アクション</option><option value="support">サポート</option></select></label>
        <label><span>スカウト</span><select value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option value="all">すべて</option><option value="normal">ノーマル</option><option value="elite">エリート</option><option value="legend">レジェンド</option></select></label>
        <label><span>状態</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">すべて</option><option value="ready">生成済み</option><option value="processing">解析中</option><option value="failed">失敗</option><option value="draft">下書き</option></select></label>
        <label><span>並び順</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">新しい順</option><option value="title">名前順</option><option value="total">能力合計順</option></select></label>
        <div className="view-toggle" role="group" aria-label="表示方法"><button aria-pressed={view === "grid"} className={view === "grid" ? "selected" : ""} onClick={() => setView("grid")}>カード</button><button aria-pressed={view === "compact"} className={view === "compact" ? "selected" : ""} onClick={() => setView("compact")}>一覧</button></div>
      </div>
    </div>
    <div className="collection-summary"><b>{visibleCards.length}</b> 枚 <span>／ 全 {cards.filter((card) => card.card_type !== "part").length} 枚</span></div>
    {state === "loading" ? <BinderSkeletonGrid /> : state === "error" ? <EmptyPanel icon={<X size={24} />} title="カードを読み込めませんでした" description="通信状態を確認して、もう一度お試しください。" action="再読み込み" onAction={() => void load()} /> : cards.every((card) => card.card_type === "part") ? <EmptyPanel icon={<BookOpen size={25} />} title="バインダーはまだ空です" description="画像から最初のカードをスカウトして、コレクションを始めましょう。" action="スカウトへ" onAction={() => navigateTo("/scout")} /> : visibleCards.length === 0 ? <EmptyPanel icon={<Search size={24} />} title="カードが見つかりません" description="検索語や絞り込み条件を変えてみてください。" action="条件をリセット" onAction={resetFilters} /> : <div key={filterKey} className={`binder-grid ${view === "compact" ? "binder-grid-compact" : ""}`}>
      {visibleCards.map((card, index) => <article className="binder-item" style={{ "--binder-index": index } as React.CSSProperties} key={card.id}>
        <button className="binder-card-open" onClick={() => navigateTo(`/cards/${card.id}`)} aria-label={`${card.title}の詳細を開く`}><CardDisplay card={card} size={view === "compact" ? "small" : "medium"} showStats={view !== "compact"} />
          <div className="binder-item-copy"><div className="binder-item-heading"><h2>{card.title}</h2><span className={`card-state state-${card.generation_status}`}><i aria-hidden="true" />{{ ready: "生成済み", processing: "解析中", draft: "下書き", failed: "要確認" }[card.generation_status]}</span></div>
            {view === "compact" && <div className="binder-inline-stats"><span>HP {card.hp}</span><span>ATK {card.atk}</span><span>DEF {card.shield}</span><span>SPD {card.speed}</span></div>}
            <p>{card.description || "カードの説明はありません。"}</p>
          </div>
        </button>
        {card.scout_tier && <span className={`tier-label tier-label-${card.scout_tier}`}>{card.scout_tier === "legend" ? "LEGEND SCOUT" : card.scout_tier === "elite" ? "ELITE SCOUT" : "NORMAL SCOUT"}</span>}
        {card.card_type === "action" && card.generation_status === "ready" && <div className="binder-share-setting"><button className={`trial-share-toggle ${card.trial_public ? "is-public" : ""}`} aria-pressed={Boolean(card.trial_public)} disabled={sharing === card.id} onClick={() => void toggleTrialPublic(card)}>{sharing === card.id ? "保存中…" : card.trial_public ? "試し切り相手に公開中" : "試し切り相手に公開"}</button><small>カード名・説明・能力・画像を共有。作者情報は非表示。</small></div>}
        {card.generation_status !== "processing" && <button className="delete-card-button" onClick={() => void removeCard(card)} disabled={deleting === card.id} aria-label={`${card.title}をバインダーから捨てる`}><Trash2 size={14} />{deleting === card.id ? "処理中" : "捨てる"}</button>}
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
  const [revealed, setRevealed] = useState(false);
  const [holding, setHolding] = useState(false);
  const revealTimer = useRef<number | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); if (revealTimer.current !== null) window.clearTimeout(revealTimer.current); }, [preview]);

  const cancelRevealHold = () => { if (revealTimer.current !== null) window.clearTimeout(revealTimer.current); revealTimer.current = null; setHolding(false); };
  const beginRevealHold = () => { if (revealed) return; if (revealTimer.current !== null) window.clearTimeout(revealTimer.current); setHolding(true); revealTimer.current = window.setTimeout(() => { setRevealed(true); setHolding(false); revealTimer.current = null; }, 1200); };

  const choose = (selected?: File) => {
    if (!selected) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(selected.type)) { setError("PNG・JPG・WEBP形式の画像を選んでください。"); setStep("error"); return; }
    if (selected.size > 10 * 1024 * 1024) { setError("画像は10MB以下にしてください。"); setStep("error"); return; }
    if (preview) URL.revokeObjectURL(preview);
    cancelRevealHold(); setRevealed(false); setFile(selected); setPreview(URL.createObjectURL(selected)); setDraft(null); setResult(null); setError(""); setCropPosition(50); setImageAspect(null); setStep("preview");
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
      setResult(generated.card); setRevealed(false); setStep("result");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "カードを生成できませんでした。"); setStep("error"); }
  };
  const reset = () => { cancelRevealHold(); setRevealed(false); setFile(null); setPreview(""); setDraft(null); setResult(null); setError(""); setStep("select"); };
  const stepNames = ["画像を選ぶ", "プレビュー", "カード生成", "完成"];
  const currentStep = step === "select" ? 1 : step === "preview" ? 2 : step === "processing" || step === "error" ? 3 : 4;
  const typeName = scoutType === "part" ? "パーツ" : scoutType === "support" ? "サポート" : "アクション";
  const tierName = scoutTier === "legend" ? "レジェンド" : scoutTier === "elite" ? "エリート" : "ノーマル";
  const isStatCard = scoutType === "action";
  const resultSkills = Array.isArray(result?.skills) ? result.skills.filter((skill): skill is Record<string, unknown> => Boolean(skill && typeof skill === "object" && !Array.isArray(skill))) : [];
  const resultSupportEffects = Array.isArray(result?.support_definition?.effects) ? result.support_definition.effects : [];

  return <div className="create-flow">
    <div className="flow-heading"><button className="back-link" onClick={step === "select" ? onBack : reset}><ArrowLeft size={15} />{step === "select" ? "ランク選択へ戻る" : "画像を選び直す"}</button><span className="flow-context">{typeName} / {tierName}</span></div>
    <ol className="flow-steps" aria-label="スカウトの進行状況">{stepNames.map((name, index) => <li key={name} className={index + 1 <= currentStep ? "complete" : ""} aria-current={index + 1 === currentStep ? "step" : undefined}><span>{index + 1 < currentStep ? <Check size={13} /> : index + 1}</span>{name}</li>)}</ol>
    {step === "select" && <label className={`upload-dropzone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }}>
      <span className="upload-icon"><ImagePlus size={25} /></span><b>カードにしたい画像を選ぶ</b><span>ここに画像をドラッグ＆ドロップするか、ファイルを選択</span><small>PNG・JPG・WEBP ／ 10MB以下</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choose(event.target.files?.[0])} /><span className="secondary-button">画像ファイルを選択</span>
    </label>}
    {step === "preview" && file && <section className="upload-preview"><div className="preview-card-crop"><Image src={preview} alt="カードに切り抜かれる範囲のプレビュー" fill unoptimized sizes="(max-width: 720px) 70vw, 280px" onLoad={(event) => setImageAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} style={{ objectPosition: `${cropPosition}% ${cropPosition}%` }} /></div><div className="preview-copy"><span className="overline">IMAGE PREVIEW</span><h2>この画像でカードを作ります</h2><p>枠内の範囲を9:16に切り抜いてスカウトします。画像を動かして、残したい部分を合わせてください。</p>{imageAspect !== null && Math.abs(imageAspect - 9 / 16) > .01 && <label className="crop-control"><span>{imageAspect > 9 / 16 ? "左右の切り抜き位置" : "上下の切り抜き位置"}</span><input aria-label="カード画像の切り抜き位置" type="range" min="0" max="100" value={cropPosition} onChange={(event) => setCropPosition(Number(event.target.value))} /><small><span>端</span><span>中央</span><span>端</span></small></label>}<dl className="file-details"><div><dt>ファイル</dt><dd>{file.name}</dd></div><div><dt>サイズ</dt><dd>{(file.size / 1024 / 1024).toFixed(1)} MB</dd></div><div><dt>形式</dt><dd>{file.type.replace("image/", "").toUpperCase()}</dd></div></dl><button className="primary-button" onClick={() => void generate()}><Sparkles size={16} />カードを生成する <ArrowRight size={16} /></button><button className="text-button" onClick={reset}>別の画像を選ぶ</button></div></section>}
    {step === "processing" && <section className="generation-stage" role="status" aria-live="polite"><div className="generation-orbit"><Sparkles size={24} /></div><span className="overline">CARD CREATION</span><h2>画像からカードを作成しています</h2><p>解析が完了するまで、この画面を開いたままお待ちください。</p><span className="loading-ring" /></section>}
    {step === "error" && <section className="flow-message error-message" role="alert"><span className="state-icon"><X size={22} /></span><h2>カードを作成できませんでした</h2><p>{error}</p><div className="flow-actions"><button className="primary-button" onClick={() => draft ? void generate() : setStep("select")}><RefreshCw size={15} />{draft ? "同じ画像で再試行" : "画像を選び直す"}</button><button className="text-button" onClick={onBack}>スカウト選択へ戻る</button></div></section>}
    {step === "result" && result && <section className={`result-showcase ${revealed ? "result-revealed" : "result-awaiting-reveal"}`}><div className={`reveal-card reveal-tier-${result.scout_tier ?? scoutTier} ${holding ? "holding" : ""} ${revealed ? "revealed" : ""}`}><CardDisplay card={result} size="large" /><div className="reveal-overlay">{revealed ? <div className="reveal-reward"><span>{(result.scout_tier ?? scoutTier).toUpperCase()}</span><b>総合値 {result.hp + result.atk + result.shield + result.speed}</b></div> : <button className="reveal-hold-button" onPointerDown={beginRevealHold} onPointerUp={cancelRevealHold} onPointerCancel={cancelRevealHold} onPointerLeave={cancelRevealHold} onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); cancelRevealHold(); setRevealed(true); } }} aria-label="カードを長押しして開封。キーボードはEnterまたはSpace"><Sparkles size={24}/><b>{holding ? "光が集まっています…" : "長押しで開封"}</b><span>カードを1.2秒押し続ける</span><i className="reveal-progress"><em/></i></button>}</div></div><div className="result-copy"><span className={`tier-label tier-label-${result.scout_tier ?? scoutTier}`}>{tierName}スカウト</span><span className="overline">CARD DISCOVERED</span><h2>{revealed ? result.title : "新しいカードが完成しました"}</h2><p>{revealed ? result.description || "新しいカードがコレクションに加わりました。" : "カードを長押しして開封すると、能力と技の結果を確認できます。"}</p>{!revealed && <button className="secondary-button result-reveal-cta" onPointerDown={beginRevealHold} onPointerUp={cancelRevealHold} onPointerCancel={cancelRevealHold} onPointerLeave={cancelRevealHold} onContextMenu={(event) => event.preventDefault()} aria-label="長押ししてカード結果を確認">{holding ? "結果を確認中…" : "長押しで結果を確認"}</button>}{revealed && <><div className="result-card-effects">{isStatCard && <div className="result-stats">{[["HP", result.hp], ["ATK", result.atk], ["DEF", result.shield], ["SPD", result.speed]].map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>}{isStatCard && <div className="reveal-total"><span>総合値</span><b>{result.hp + result.atk + result.shield + result.speed}</b><small>能力値合計</small></div>}{resultSkills.length > 0 && <div className="result-skill-list"><b>{scoutType === "part" ? "パーツ効果" : "技・パッシブ"}</b>{resultSkills.map((skill, index) => <div className="result-skill-item" key={`${String(skill.name ?? "skill")}-${index}`}><strong>{skill.skill_type === "passive" ? "パッシブ" : "アクティブ"} · {String(skill.name ?? "未設定")}</strong><span>{String(skill.description ?? "効果を発動します。")}</span></div>)}</div>}{resultSupportEffects.length > 0 && <div className="result-skill-list"><b>サポート効果</b>{resultSupportEffects.map((effect, index) => <div className="result-skill-item" key={`support-effect-${index}`}><strong>{String((effect as Record<string, unknown>).type ?? "効果")}</strong><span>サポートカード使用時に効果を発動します。</span></div>)}</div>}</div><p className="saved-note"><Check size={15} />カードは自動でバインダーに保存されました。</p><button className="primary-button" onClick={() => navigate("BINDER")}>バインダーで見る <ArrowRight size={16} /></button><button className="text-button" onClick={reset}><Plus size={15} />もう一枚スカウト</button></>}</div></section>}
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
    setName(result.deck.name); setSavedName(result.deck.name); setDeckCards(result.cards ?? []); setPendingIds(selectableDeckIds(result.cards ?? []));
  };
  useEffect(() => { let live = true; Promise.all([fetch("/api/decks").then((response) => readJson<{ decks: DeckSummary[] }>(response)), fetch("/api/cards").then((response) => readJson<{ cards: CardRecord[] }>(response))]).then(async ([deckResult, cardResult]) => { if (!live) return; setDecks(deckResult.decks ?? []); setCards((cardResult.cards ?? []).filter((card) => card.generation_status === "ready")); const next = deckResult.decks?.[0]?.id ?? ""; setSelected(next); if (next) { const detail = await readJson<{ deck: DeckSummary; cards: DeckCard[] }>(await fetch(`/api/decks/${next}`)); if (!live) return; setName(detail.deck.name); setSavedName(detail.deck.name); setDeckCards(detail.cards ?? []); setPendingIds(selectableDeckIds(detail.cards ?? [])); } setLoading(false); }).catch((caught) => { if (live) { setError(caught instanceof Error ? caught.message : "デッキを読み込めませんでした"); setLoading(false); } }); return () => { live = false; }; }, []);
  const dirty = pendingIds.join("|") !== selectableDeckIds(deckCards).join("|") || name !== savedName;
  const deckCatalog = [...cards, ...deckCards.map((row) => row.card).filter((card): card is CardRecord => Boolean(card))].filter((card, index, all) => all.findIndex((candidate) => candidate.id === card.id) === index);
  const selectableCards = cards.filter((card) => card.card_type !== "part");
  const visibleCards = selectableCards.filter((card) => (typeFilter === "all" || card.card_type === typeFilter) && `${card.title} ${card.description ?? ""}`.toLocaleLowerCase("ja").includes(query.trim().toLocaleLowerCase("ja")));
  const run = async (operation: () => Promise<void>) => { setBusy(true); setError(""); setFeedback(""); try { await operation(); } catch (caught) { setError(caught instanceof Error ? caught.message : "保存できませんでした"); } finally { setBusy(false); } };
  const createDeck = () => void run(async () => { const result = await readJson<{ deck: DeckSummary }>(await fetch("/api/decks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "My Deck" }) })); setDecks((current) => [result.deck, ...current]); setSelected(result.deck.id); setName(result.deck.name); setSavedName(result.deck.name); setDeckCards([]); setPendingIds([]); });
  const save = () => void run(async () => { const nameResult = await readJson<{ deck: DeckSummary }>(await fetch(`/api/decks/${selected}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) })); await readJson(await fetch(`/api/decks/${selected}/cards`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardIds: pendingIds }) })); setName(nameResult.deck.name); setSavedName(nameResult.deck.name); await loadDeck(selected); setFeedback("デッキを保存しました。"); });
  const deleteDeck = () => void run(async () => { const deck = decks.find((item) => item.id === selected); if (!deck || !window.confirm(`「${deck.name}」を削除しますか？`)) return; await readJson(await fetch(`/api/decks/${selected}`, { method: "DELETE" })); const nextDecks = decks.filter((item) => item.id !== selected); setDecks(nextDecks); setSelected(nextDecks[0]?.id ?? ""); if (nextDecks[0]) await loadDeck(nextDecks[0].id); else { setDeckCards([]); setPendingIds([]); setName(""); setSavedName(""); } });
  const toggleCard = (card: CardRecord) => {
    if (card.card_type === "part") return;
    if (pendingIds.includes(card.id)) { setPendingIds((current) => current.filter((id) => id !== card.id)); setError(""); return; }
    const actionCount = pendingIds.filter((id) => cards.find((item) => item.id === id)?.card_type === "action").length;
    if (card.card_type === "action" && actionCount >= 5) { setError("アクションカードは最大5枚です。"); return; }
    const next = [...pendingIds, card.id];
    try {
      const expanded = expandDeckCardIds(next, deckCatalog as DeckCardCandidate[]);
      if (expanded.length > 20) { setError("パーツの自動追加後に20枚を超えるため、このカードは追加できません。"); return; }
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "";
      setError(code === "ACTION_LIMIT" ? "アクションカードは最大5枚です。" : "パーツの自動追加後に20枚を超えるため、このカードは追加できません。");
      return;
    }
    setPendingIds(next); setError("");
  };
  const moveCard = (index: number, offset: number) => setPendingIds((current) => { const next = [...current]; const target = index + offset; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const addByDrop = (event: React.DragEvent) => { event.preventDefault(); setDragId(null); const id = event.dataTransfer.getData("text/card-id"); const card = cards.find((item) => item.id === id); if (card) toggleCard(card); };
  const expandedPendingIds = (() => { try { return expandDeckCardIds(pendingIds, deckCatalog as DeckCardCandidate[]); } catch { return pendingIds; } })();
  const mappedDeckCards = expandedPendingIds.map((id) => deckCatalog.find((card) => card.id === id) ?? null).filter((card): card is CardRecord => Boolean(card));
  const actionCount = mappedDeckCards.filter((card) => card.card_type === "action").length;
  const supportCount = mappedDeckCards.filter((card) => card.card_type === "support").length;
  const partCount = mappedDeckCards.filter((card) => card.card_type === "part").length;

  if (loading) return <div className="empty-state"><span className="loading-ring" /><h2>編成卓を準備しています</h2><p>デッキと所有カードを読み込んでいます。</p></div>;
  if (!decks.length) return <div className="deck-empty-shell"><EmptyPanel icon={<Layers3 size={25} />} title="デッキを作成しましょう" description="カードを組み合わせて、自分の戦い方を準備します。" action="デッキを作成" onAction={createDeck} />{error && <p className="form-feedback error-text" role="alert">{error}</p>}<button className="text-button" onClick={() => navigate("BINDER")}>先にカードを見る <ArrowRight size={14} /></button></div>;

  return <section className="deck-builder">
    <div className="deck-topbar"><label className="deck-select-field"><span>編集中のデッキ</span><select value={selected} onChange={(event) => { const id = event.target.value; setSelected(id); void loadDeck(id).catch((caught) => setError(caught.message)); }}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label><button className="secondary-button" onClick={createDeck} disabled={busy}><Plus size={15} />新規デッキ</button><button className="quiet-danger" onClick={deleteDeck} disabled={busy}><Trash2 size={15} />削除</button></div>
    <div className="deck-workbench">
      <section className="owned-library"><div className="section-title-row"><div><span className="overline">OWNED CARDS</span><h2>カードを選ぶ</h2></div><span className="count-pill">{selectableCards.length}枚</span></div>
        <div className="library-controls"><label className="search-field"><Search size={16} /><span className="sr-only">所有カードを検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="カード名で検索" /></label><select aria-label="カード種別" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">すべて</option><option value="action">アクション</option><option value="support">サポート</option></select></div>
        {selectableCards.length === 0 ? <div className="mini-empty"><BookOpen size={19} /><p>編成できるカードがありません。</p><button className="text-button" onClick={() => navigate("SCOUT")}>カードをスカウト <ArrowRight size={14} /></button></div> : <div className="library-card-list">{visibleCards.map((card) => { const inDeck = pendingIds.includes(card.id); return <article key={card.id} className={`library-card-row ${inDeck ? "in-deck" : ""}`} draggable onDragStart={(event) => { setDragId(card.id); event.dataTransfer.setData("text/card-id", card.id); }} onDragEnd={() => setDragId(null)}><div className="library-thumb"><CardDisplay card={card} size="small" showStats={false} /></div><div className="library-card-copy"><b>{card.title}</b><small>{card.card_type === "action" ? "アクション" : "サポート"}</small><span>HP {card.hp} · ATK {card.atk} · DEF {card.shield}</span></div><button className={inDeck ? "selection-button selected" : "selection-button"} aria-pressed={inDeck} disabled={busy} onClick={() => toggleCard(card)}>{inDeck ? <><Check size={14} />選択中</> : <><Plus size={14} />追加</>}</button></article>; })}{visibleCards.length === 0 && <p className="mini-empty">条件に合うカードがありません。</p>}</div>}
      </section>
      <section className={`deck-preview-panel ${dragId ? "drop-active" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={addByDrop}>
        <div className="section-title-row"><div><span className="overline">DECK LOADOUT</span><h2>編成プレビュー</h2></div><span className={`save-state ${dirty ? "unsaved" : "saved"}`}><i />{dirty ? "未保存の変更" : "保存済み"}</span></div>
        <label className="deck-name-field"><span>デッキ名</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <div className="deck-composition"><span><b>{mappedDeckCards.length}</b> / 20 枚</span><i /><span>アクション {actionCount}</span><span>サポート {supportCount}</span><span>パーツ {partCount}</span><small>関連パーツは親カード選択時に自動で含まれます</small></div>
        <div className="deck-slot-list" aria-label="デッキカードの並び順">
          {Array.from({ length: 20 }, (_, index) => { const card = mappedDeckCards[index]; const selectedIndex = card ? pendingIds.indexOf(card.id) : -1; return <div key={card?.id ?? `slot-${index}`}  className={`deck-loadout-slot ${card ? "filled" : "empty"} ${card?.card_type === "part" ? "part-slot" : ""}`}>
            <span className="slot-number">{String(index + 1).padStart(2, "0")}</span>
            {card ? <><div className="slot-thumb"><CardDisplay card={card} imageSrc={deckCardImageSrc(card, deckCatalog)} size="small" showStats={false} /></div><div className="slot-copy"><b>{deckCardTitle(card, deckCatalog)}</b><small>{card.card_type === "part" ? "パーツ" : card.card_type === "support" ? "サポート" : "アクション"}</small></div>{selectedIndex >= 0 ? <div className="slot-actions"><button onClick={() => moveCard(selectedIndex, -1)} disabled={selectedIndex === 0} aria-label={`${card.title}を上へ`}><ArrowUp size={14} /></button><button onClick={() => moveCard(selectedIndex, 1)} disabled={selectedIndex === pendingIds.length - 1} aria-label={`${card.title}を下へ`}><ArrowDown size={14} /></button><button onClick={() => setPendingIds((current) => current.filter((id) => id !== card.id))} aria-label={`${card.title}をデッキから外す`}><X size={15} /></button></div> : <small className="auto-part-tag">自動装着</small>}</> : <span className="slot-placeholder">カードを選ぶとここに追加されます</span>}
          </div>; })}
        </div>
        <div className="deck-save-bar"><span>{mappedDeckCards.length >= 20 ? "デッキは上限枚数です" : `あと ${20 - mappedDeckCards.length} 枚追加できます`}</span><button className="primary-button" onClick={save} disabled={busy || !dirty || !name.trim()}>{busy ? "保存中…" : "変更を保存"}<Check size={15} /></button></div>
        {error && <p className="form-feedback error-text" role="alert">{error}</p>}{feedback && <p className="form-feedback" role="status">{feedback}</p>}
      </section>
    </div>
  </section>;
}

function MatchFlow({ navigate, navigateTo, immersiveBattleId }: { navigate: (section: string) => void; navigateTo: (path: string) => void; immersiveBattleId?: string }) {
  const router = useRouter();
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
  const [flickMessage, setFlickMessage] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [queueExpiresAt, setQueueExpiresAt] = useState<number | null>(null);
  const refreshBattleStateRef = useRef<() => Promise<void>>(async () => undefined);
  const statePollInFlightRef = useRef(false);
  const lastEventSequenceRef = useRef(0);
  const lastStateVersionRef = useRef<number | null>(null);
  const flickRef = useRef<{ instanceId: string; x: number; y: number } | null>(null);

  const loadDecks = async (deckId?: string) => {
    const result = await readJson<{ decks: DeckSummary[] }>(await fetch("/api/decks"));
    setDecks(result.decks ?? []);
    const next = deckId || selected || result.decks?.[0]?.id || "";
    setSelected(next);
    if (!next) { setRows([]); return; }
    const deckResult = await readJson<{ cards: DeckCard[] }>(await fetch(`/api/decks/${next}`));
    setRows(deckResult.cards ?? []);
  };
  useEffect(() => {
    let live = true;
    const initialize = async () => {
      const deckResult = await readJson<{ decks: DeckSummary[] }>(await fetch("/api/decks"));
      const queueResult = await readJson<{ entry: QueueEntry | null; battle?: BattleSummary | null }>(await fetch("/api/matchmaking"));
      if (!live) return;
      setDecks(deckResult.decks ?? []);
      const next = deckResult.decks?.[0]?.id ?? "";
      setSelected(next);
      if (next) {
        const details = await readJson<{ cards: DeckCard[] }>(await fetch(`/api/decks/${next}`));
        if (live) setRows(details.cards ?? []);
      }
      const queuedBattle = queueResult.battle ?? null;
      let availableBattles: BattleSummary[] = [];
      // Existing battle restoration is the only path that needs the battle list.
      if (immersiveBattleId || (!queuedBattle && queueResult.entry?.status !== "queued")) {
        const battleResult = await readJson<BattleListResponse>(await fetch("/api/battles"));
        availableBattles = listedBattles(battleResult);
      }
      const requested = immersiveBattleId ? availableBattles.find((item) => item.id === immersiveBattleId) : undefined;
      const recent = requested ?? availableBattles.find((item) => item.status === "active");
      const found = queuedBattle ?? recent;
      if (found) {
        setBattle(found);
        if (found.status === "active" && !immersiveBattleId) router.replace(`/battle/match/${found.id}`);
      } else if (queueResult.entry?.status === "queued") {
        setQueueing(true);
        setQueueExpiresAt(new Date(queueResult.entry.expires_at).getTime());
      } else if (immersiveBattleId) {
        router.replace("/battle");
      }
      if (live) setLoading(false);
    };
    initialize().catch((caught) => {
      if (live) { setError(caught instanceof Error ? caught.message : "読み込めませんでした"); setLoading(false); }
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!queueing || battle) return;
    let live = true;
    const poll = async () => {
      if (queueExpiresAt !== null && Date.now() >= queueExpiresAt) { setQueueing(false); setQueueExpiresAt(null); setError("制限時間内に対戦相手が見つかりませんでした。もう一度お試しください。"); void fetch("/api/matchmaking", { method: "DELETE" }); return; }
      try {
        const status = await readJson<{ entry: QueueEntry | null; battle?: BattleSummary | null }>(await fetch("/api/matchmaking"));
        if (!live) return;
        const entry = status.entry;
        if (entry?.status === "matched" && entry.battle_id) {
          const found = status.battle ?? null;
          if (live && found) { setBattle(found); setQueueing(false); setQueueExpiresAt(null); setMatchMessage("対戦相手が見つかりました。盤面を同期しています。"); navigateTo(`/battle/match/${found.id}`); }
        } else if (entry?.status === "expired" || entry?.status === "cancelled" || !entry) {
          setQueueing(false); setQueueExpiresAt(null); setError(entry?.status === "expired" ? "マッチングの制限時間を過ぎました。もう一度お試しください。" : "マッチングが終了しました。");
        }
      } catch { if (live) setError("接続を確認できません。再接続を試みています。"); }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => { live = false; window.clearInterval(timer); };
  }, [queueing, battle, queueExpiresAt]);

  useEffect(() => {
    if (!battle) return;
    let live = true;
    lastEventSequenceRef.current = 0;
    lastStateVersionRef.current = null;
    const pollState = async () => {
      if (statePollInFlightRef.current) return;
      statePollInFlightRef.current = true;
      try {
        setSyncing(true);
        const stateUrl = lastStateVersionRef.current === null ? `/api/battles/${battle.id}/state` : `/api/battles/${battle.id}/state?since=${lastStateVersionRef.current}`;
        const stateResponse = await fetch(stateUrl);
        const stateData = await readJson<{ unchanged?: boolean; stateVersion?: number; state?: BattleSnapshot }>(stateResponse);
        if (stateData.unchanged) return;
        const eventResponse = await fetch(`/api/battles/${battle.id}/events?after=${lastEventSequenceRef.current}`);
        const eventData = await readJson<{ events: BattleEventView[] }>(eventResponse);
        const nextEvents = eventData.events ?? [];
        if (nextEvents.length) {
          lastEventSequenceRef.current = Math.max(lastEventSequenceRef.current, ...nextEvents.map((event) => event.sequence));
        }
        if (live && stateData.state) {
          lastStateVersionRef.current = stateData.state.battle.state_version;
          setBattleState(stateData.state);
          setEvents((current) => [...current, ...nextEvents].slice(-100));
          setBattle(stateData.state.battle);
          setMatchMessage("");
          setError("");
        }
      } catch { if (live) setError("対戦状態を再同期しています。"); }
      finally { statePollInFlightRef.current = false; if (live) setSyncing(false); }
    };
    refreshBattleStateRef.current = pollState;
    void pollState();
    const timer = window.setInterval(() => void pollState(), 3000);
    return () => { live = false; refreshBattleStateRef.current = async () => undefined; window.clearInterval(timer); };
  }, [battle?.id]);

  const startMatch = async () => {
    if (!selected || queueing) return;
    setError(""); setMatchMessage("");
    try { const result = await readJson<{ entry: { status?: string; battleId?: string } | null; battleId: string | null; battle?: BattleSummary | null }>(await fetch("/api/matchmaking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deckId: selected }) })); if (result.battleId && result.battle) { const found = result.battle; setBattle(found); setMatchMessage("対戦相手が見つかりました。盤面を同期しています。"); navigateTo(`/battle/match/${found.id}`); return; } setQueueExpiresAt(Date.now() + 120_000); setQueueing(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "マッチングを開始できませんでした。"); }
  };
  const cancelMatch = async () => {
    try { await readJson(await fetch("/api/matchmaking", { method: "DELETE" })); setQueueing(false); setQueueExpiresAt(null); setMatchMessage("マッチングをキャンセルしました。"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "キャンセルできませんでした。"); }
  };
  const submitBattleAction = async (type: "use_skill" | "end_turn" | "use_support" | "play_action" | "equip_part", payload: Record<string, unknown> = {}) => {
    if (!battle || !battleState || battle.active_player_id !== battleState.currentPlayerId || acting) return;
    setActing(true); setError("");
    try { await readJson(await fetch(`/api/battles/${battle.id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actionId: crypto.randomUUID(), expectedVersion: battle.state_version, type, ...payload }) })); await refreshBattleStateRef.current(); setFlickMessage(type === "use_support" ? "サポートを使用しました" : type === "play_action" ? "アクションを場に出しました" : type === "equip_part" ? "パーツを装着しました" : ""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作を送信できませんでした。"); }
    finally { setActing(false); }
  };
  const playSupport = (instanceId: string) => { const support = battleState?.cards.find((card) => card.instanceId === instanceId && card.zone === "hand" && card.playerId === battleState.currentPlayerId); if (support?.supportInfo) void submitBattleAction("use_support", { supportInstanceId: support.instanceId, targetInstanceIds: support.supportInfo.targets.map((target) => target.instanceId) }); };
  const playAction = (instanceId: string) => void submitBattleAction("play_action", { cardInstanceId: instanceId });
  const equipPart = (partInstanceId: string, targetInstanceId: string) => void submitBattleAction("equip_part", { partInstanceId, targetInstanceId });
  const beginFlick = (instanceId: string, event: ReactPointerEvent) => { flickRef.current = { instanceId, x: event.clientX, y: event.clientY }; };
  const finishFlick = (target: "center" | string, event: ReactPointerEvent) => {
    const start = flickRef.current; flickRef.current = null; if (!start) return;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y; if (Math.hypot(dx, dy) < 42) return;
    const card = battleState?.cards.find((candidate) => candidate.instanceId === start.instanceId && candidate.zone === "hand" && candidate.playerId === battleState.currentPlayerId);
    if (!card) return;
    if (target === "center" && card.cardType === "support") playSupport(card.instanceId);
    else if (target === "center" && card.cardType === "action") playAction(card.instanceId);
    else if (card.cardType === "part") equipPart(card.instanceId, target);
    else setFlickMessage(card.cardType === "part" ? "パーツは装着先のアクションカードへフリックしてください" : "中央の場へフリックしてください");
  };
  const selectedDeckCards = rows.map((row) => row.card).filter((card): card is CardRecord => Boolean(card));
  const actionCount = rows.filter((row) => row.role === "action").length;
  if (loading) return <div className="empty-state"><span className="loading-ring" /><h2>アリーナを準備しています</h2><p>デッキを確認しています。</p></div>;
  if (!decks.length) return <div className="arena-empty"><EmptyPanel icon={<Swords size={25} />} title="対戦の前にデッキを作成" description="アクションカードを選んで、バトルの準備をしましょう。" action="デッキ編成へ" onAction={() => navigate("DECK")} /></div>;

  if (!battle) return <section className="arena-lobby">
    <div className="arena-lobby-head"><div><span className="overline">BATTLE ARENA</span><h2>出撃デッキを選ぶ</h2><p>準備ができたら、アリーナで対戦相手を探します。</p></div><div className="arena-status-badge"><span className={queueing ? "connection-dot searching" : "connection-dot"} />{queueing ? "対戦相手を検索中" : "待機中"}</div></div>
    <div className="arena-deck-picker"><label><span>使用するデッキ</span><select value={selected} disabled={queueing} onChange={(event) => void loadDecks(event.target.value).catch((caught) => setError(caught.message))}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label><button className="text-button" onClick={() => navigate("DECK")} disabled={queueing}>デッキを編集 <ArrowRight size={14} /></button></div>
    <div className="prebattle-summary"><div className="prebattle-title"><span>YOUR LOADOUT</span><b>{selectedDeckCards.length}枚のカード</b></div><div className="prebattle-cards">{selectedDeckCards.slice(0, 5).map((card) => <div className="prebattle-card" key={card.id}><CardDisplay card={card} size="small" showStats={false} /><b>{card.title}</b></div>)}{selectedDeckCards.length === 0 && <p className="mini-empty">このデッキにカードがありません。</p>}</div><p className="deck-requirement"><Shield size={15} />アクションカード {actionCount} 枚</p></div>
    {queueing ? <div className="match-search-state" role="status" aria-live="polite"><span className="match-radar"><Swords size={19} /></span><div><b>アリーナを検索しています</b><p>対戦相手が見つかると、ここに対戦盤面を表示します。</p></div><button className="secondary-button" onClick={() => void cancelMatch()}>検索をキャンセル</button></div> : <div className="arena-mode-actions"><button className="primary-button arena-start-button" onClick={() => void startMatch()} disabled={!selected || actionCount === 0}><Swords size={17} />対人マッチング <ArrowRight size={16} /></button><button className="secondary-button arena-trial-button" onClick={() => navigateTo(`/battle/trial${selected ? `?deckId=${encodeURIComponent(selected)}` : ""}`)} disabled={!selected || actionCount === 0}><Sparkles size={16} />試し切り <ArrowRight size={15} /></button></div>}
    {actionCount === 0 && <p className="inline-hint">対戦するにはデッキにアクションカードが必要です。<button onClick={() => navigate("DECK")}>デッキを編成</button></p>}
    {error && <p className="form-feedback error-text" role="alert">{error}</p>}{matchMessage && <p className="form-feedback" role="status">{matchMessage}</p>}
  </section>;

  const state = battleState;
  const opponentCards = state?.cards.filter((card) => card.playerId !== state.currentPlayerId && card.zone === "field") ?? [];
  const ownCards = state?.cards.filter((card) => card.playerId === state.currentPlayerId && card.zone === "field") ?? [];
  const handCards = state?.cards.filter((card) => card.playerId === state.currentPlayerId && card.zone === "hand") ?? [];
  const discardCards = state?.cards.filter((card) => card.playerId === state.currentPlayerId && card.zone === "discard") ?? [];
  const destroyedCards = state?.cards.filter((card) => card.playerId === state.currentPlayerId && card.defeated) ?? [];
  const selectedCard = state?.cards.find((card) => card.instanceId === selectedCardId) ?? null;
  const selectedSkills = selectedCard ? battleSkillDetails(selectedCard) : [];
  const canAct = Boolean(battleState && battle.active_player_id === battleState.currentPlayerId && !acting && battle.status === "active");
  const useSelectedSkill = (skillSlot: number) => {
    if (!selectedCard || selectedCard.cardType !== "action" || selectedCard.zone !== "field") return;
    const targetIds = opponentCards.filter((card) => !card.defeated).map((card) => card.instanceId);
    void submitBattleAction("use_skill", { actorInstanceId: selectedCard.instanceId, skillSlot, targetInstanceIds: targetIds });
    setSelectedCardId(null);
  };
  const pointCount = ownCards.reduce((sum, card) => sum + card.ap, 0);
  return <section className={`battle-live battle-live-minimal ${immersiveBattleId ? "battle-live-immersive" : ""}`}>
    <header className="battle-minimal-header"><div><span className="overline">TURN</span><strong>{battle.turn}</strong></div><div className="battle-point-count"><span>POINT</span><b>{pointCount}</b><small>AP</small></div><button className="battle-log-menu-button" aria-label="バトルログを開く" aria-expanded={logOpen} onClick={() => setLogOpen(true)}><Menu size={18}/><span>ログ</span></button></header>
    <section className="minimal-field enemy-field"><div className="minimal-field-heading"><b>敵の場</b><span>{opponentCards.length}枚</span></div><div className="minimal-card-row">{opponentCards.length ? opponentCards.map((card) => <BattleFieldCard key={card.instanceId} card={card} battleId={battle.id} side="opponent" />) : <div className="minimal-empty">相手の場を同期中</div>}</div></section>
    <div className="minimal-center-drop" onPointerUp={(event) => finishFlick("center", event)}><span>ここへフリック</span><small>サポートを使用 · アクションを配置</small></div>
    <section className="minimal-field own-field"><div className="minimal-field-heading"><b>自分の場</b><span>{ownCards.length}枚 · {ownCards.reduce((sum, card) => sum + card.hp, 0)} HP</span></div><div className="minimal-card-row">{ownCards.length ? ownCards.map((card) => <div key={card.instanceId} onPointerUp={(event) => finishFlick(card.instanceId, event)} onClick={() => setSelectedCardId(card.instanceId)}><BattleFieldCard card={card} battleId={battle.id} side="own" /></div>) : <div className="minimal-empty">自分の場にカードがありません</div>}</div></section>
    <section className="minimal-hand"><div className="minimal-hand-heading"><b>手札</b><span>タップで詳細 · フリックで場へ</span></div><div className="minimal-hand-row">{handCards.length ? handCards.map((card) => <div key={card.instanceId} className={`minimal-hand-card ${card.supportInfo?.canUse === false ? "is-used" : ""}`} onPointerDown={(event) => beginFlick(card.instanceId, event)} onPointerUp={(event) => finishFlick("center", event)} onClick={() => setSelectedCardId(card.instanceId)}><CardDisplay card={{ id: card.source_card_id ?? card.id, title: card.title, description: card.description, card_type: card.cardType, hp: card.hp, atk: card.atk, shield: card.def, speed: card.speed, generation_status: "ready" }} imageSrc={`/api/battles/${encodeURIComponent(battle.id)}/cards/${encodeURIComponent(card.id)}/image`} size="small" showStats={false} /><b>{card.cardType === "support" ? "サポート" : card.cardType === "part" ? "パーツ" : "アクション"}</b>{card.supportInfo?.canUse === false && <small>使用済み</small>}</div>) : <div className="minimal-empty">手札はありません</div>}</div><div className="minimal-zone-summary"><span>手札 {handCards.length}</span><span>捨て札 {discardCards.length}</span><span>破壊済み {destroyedCards.length}</span></div></section>
    {flickMessage && <p className="minimal-flick-message" role="status">{flickMessage}</p>}
    {syncing && <span className="minimal-sync" aria-live="polite">同期中…</span>}
    {error && <p className="form-feedback error-text" role="alert">{error}</p>}
    {selectedCard && <BattleCardActionModal card={selectedCard} battleId={battle.id} skills={selectedSkills} canAct={canAct} onClose={() => setSelectedCardId(null)} onSkill={useSelectedSkill} onPlay={() => { if (selectedCard.cardType === "action") playAction(selectedCard.instanceId); else if (selectedCard.cardType === "support") playSupport(selectedCard.instanceId); setSelectedCardId(null); }} />}
    {logOpen && <BattleLogDrawer events={events} onClose={() => setLogOpen(false)} />}
  </section>;
}
type BattleSupportTarget = { instanceId: string; title: string };
type BattleSupportInfo = { description: string; timing: string; targetScope: string; consumeOnPlay: boolean; useCount: number; maxUses: number; canUse: boolean; targets: BattleSupportTarget[] };
type BattleSnapshot = { currentPlayerId: string; battle: { id: string; status: string; turn: number; active_player_id: string | null; winner_player_id: string | null; state_version: number }; cards: Array<{ id: string; source_card_id: string | null; instanceId: string; playerId: string; title: string; description?: string | null; cardType: string; hp: number; maxHp: number; atk: number; def: number; speed: number; ap: number; maxAp: number; skills: unknown[]; statuses?: unknown[]; equipped_part_ids?: unknown; zone: string; defeated?: boolean; supportInfo?: BattleSupportInfo }> };
type BattleEventView = { id: string; sequence: number; event_type: string; created_at: string };
type QueueEntry = { status: string; expires_at: string; battle_id: string | null };
type BattleSummary = BattleSnapshot["battle"];
type BattleListResponse = { battles: Array<{ battles: BattleSnapshot["battle"] | BattleSnapshot["battle"][] | null }> };
function listedBattles(result: BattleListResponse): BattleSnapshot["battle"][] { return (result.battles ?? []).flatMap((row) => Array.isArray(row.battles) ? row.battles : row.battles ? [row.battles] : []); }
function BattleFieldCard({ card, battleId, side }: { card: BattleSnapshot["cards"][number]; battleId: string; side: "own" | "opponent" }) {
  const displayCard: DisplayCard = { id: card.source_card_id ?? card.id, title: card.title, description: card.description, card_type: card.cardType, hp: card.hp, atk: card.atk, shield: card.def, speed: card.speed, generation_status: "ready" };
  const hpPercent = card.maxHp > 0 ? Math.max(0, Math.min(100, card.hp / card.maxHp * 100)) : 0;
  const statuses = Array.isArray(card.statuses) ? card.statuses.filter((status): status is Record<string, unknown> => Boolean(status && typeof status === "object" && !Array.isArray(status))).slice(0, 3) : [];
  const equippedParts = Array.isArray(card.equipped_part_ids) ? card.equipped_part_ids.length : 0;
  return <article className={`battle-field-card battle-field-card-${side} ${card.defeated ? "defeated" : ""}`}><span className="battle-card-side-label">{side === "own" ? "YOU" : "ENEMY"}</span><CardDisplay card={displayCard} imageSrc={`/api/battles/${encodeURIComponent(battleId)}/cards/${encodeURIComponent(card.id)}/image`} size="small" showStats={false} /><div className="battle-unit-info"><b>{card.title}</b><div className="hp-meter" aria-label={`HP ${card.hp} / ${card.maxHp}`}><span style={{ width: `${hpPercent}%` }} /><small>HP {card.hp} / {card.maxHp}</small></div><div className="battle-unit-stats"><span>ATK <b>{card.atk}</b></span><span>DEF <b>{card.def}</b></span><span>SPD <b>{card.speed}</b></span></div>{equippedParts > 0 && <span className="equipped-parts">パーツ {equippedParts}/2</span>}{statuses.length > 0 && <div className="battle-status-badges">{statuses.map((status, index) => <span key={`${String(status.key ?? "status")}-${index}`}>{String(status.key ?? "状態")}{typeof status.remainingTurns === "number" ? ` ${status.remainingTurns}` : ""}</span>)}</div>}</div></article>;
}
type BattleSkillDetails = { slot: number; name: string; description: string; cost: number; skillType: string };
function battleSkillDetails(card: BattleSnapshot["cards"][number]): BattleSkillDetails[] {
  return card.skills.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))).map((skill, index) => ({
    slot: typeof skill.slot === "number" ? skill.slot : index + 1,
    name: typeof skill.name === "string" ? skill.name : `技 ${index + 1}`,
    description: typeof skill.description === "string" ? skill.description : "カードに記された効果を発動します。",
    cost: skill.skill_type === "passive" ? 0 : typeof skill.cost === "number" ? skill.cost : 100,
    skillType: skill.skill_type === "passive" ? "passive" : "active",
  }));
}
function BattleCardActionModal({ card, battleId, skills, canAct, onClose, onSkill, onPlay }: { card: BattleSnapshot["cards"][number]; battleId: string; skills: BattleSkillDetails[]; canAct: boolean; onClose: () => void; onSkill: (slot: number) => void; onPlay: () => void }) {
  const displayCard: DisplayCard = { id: card.source_card_id ?? card.id, title: card.title, description: card.description, card_type: card.cardType, hp: card.hp, atk: card.atk, shield: card.def, speed: card.speed, generation_status: "ready" };
  const isHand = card.zone === "hand";
  return <div className="battle-modal-backdrop" role="presentation" onClick={onClose}><section className="battle-card-modal" role="dialog" aria-modal="true" aria-label={`${card.title}の詳細`} onClick={(event) => event.stopPropagation()}><button className="battle-modal-close" onClick={onClose} aria-label="カード詳細を閉じる"><X size={18}/></button><div className="battle-modal-card-art"><CardDisplay card={displayCard} imageSrc={`/api/battles/${encodeURIComponent(battleId)}/cards/${encodeURIComponent(card.id)}/image`} size="large" showStats={false}/></div><div className="battle-modal-copy"><span className="overline">{isHand ? "HAND CARD" : card.defeated ? "DESTROYED" : "ACTIVE CARD"}</span><h2>{card.title}</h2><p>{card.description || "カードの説明はありません。"}</p><div className="battle-modal-stats"><span>HP <b>{card.hp}/{card.maxHp}</b></span><span>ATK <b>{card.atk}</b></span><span>DEF <b>{card.def}</b></span><span>AP <b>{card.ap}/{card.maxAp}</b></span></div>{card.cardType === "action" && <div className="battle-modal-skills"><h3>カード内の技</h3>{skills.length ? skills.map((skill) => <button key={skill.slot} className="battle-modal-skill" disabled={!canAct || isHand || card.defeated || skill.skillType === "passive" || card.ap < skill.cost} onClick={() => onSkill(skill.slot)}><span><b>{skill.name}</b><small>{skill.description}</small></span><strong>{skill.skillType === "passive" ? "自動" : `${skill.cost} AP`}</strong></button>) : <p className="mini-empty">このカードに発動可能な技はありません。</p>}</div>}{isHand && card.cardType === "action" && <button className="primary-button battle-modal-primary" disabled={!canAct || card.defeated} onClick={onPlay}>このアクションを場に出す <ArrowRight size={15}/></button>}{isHand && card.cardType === "support" && <button className="primary-button battle-modal-primary" disabled={!canAct || card.supportInfo?.canUse === false} onClick={onPlay}>サポートを使用する <ArrowRight size={15}/></button>}</div></section></div>;
}
function BattleLogDrawer({ events, onClose }: { events: BattleEventView[]; onClose: () => void }) {
  const labels: Record<string, string> = { action_accepted: "技を発動", damage_applied: "ダメージ", actor_defeated: "カード破壊", battle_finished: "バトル終了", support_discarded: "サポート消費", support_play_accepted: "サポート使用", turn_ended: "ターン終了" };
  return <div className="battle-log-backdrop" role="presentation" onClick={onClose}><aside className="battle-log-drawer" role="dialog" aria-modal="true" aria-label="バトルログ" onClick={(event) => event.stopPropagation()}><div className="battle-log-drawer-header"><div><span className="overline">BATTLE LOG</span><h2>行動履歴</h2></div><button className="battle-modal-close" onClick={onClose} aria-label="バトルログを閉じる"><X size={18}/></button></div>{events.length ? <ol>{events.slice(-24).reverse().map((event) => <li key={event.id}><span>{event.sequence}</span><div><b>{labels[event.event_type] ?? event.event_type.replaceAll("_", " ")}</b><small>{new Date(event.created_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</small></div></li>)}</ol> : <p className="mini-empty">まだ行動ログはありません。</p>}</aside></div>;
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
