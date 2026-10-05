/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Clock3, Menu, RefreshCw, Search, Shield, Sparkles, Swords, X, Trophy, Share2, Download, Play, BookOpen } from "lucide-react";
import { CardDisplay, type CardSkillDisplay, type DisplayCard } from "@/components/card-display";
import { FullscreenButton } from "@/components/fullscreen-button";
import { applyAction, createBattle } from "@/lib/battle/engine";
import { STARTER_CARDS, STARTER_OPPONENT } from "../../../../../../packages/domain/src/starter-cards.ts";
import type { BattleAction, BattleCard, BattleState } from "@/lib/battle/types";

type Card = DisplayCard & {
  id: string; title: string; description: string | null; card_type: "action" | "part" | "support";
  parent_card_id?: string | null;
  hp: number; atk: number; shield: number; speed: number; skills?: unknown[]; scout_tier?: "normal" | "elite" | "legend" | null;
  support_definition?: BattleCard["supportDefinition"]; created_at?: string; imageSrc?: string;
};
type Deck = { id: string; name: string };
type DeckRow = { role: string; card: Card | null };
type OpponentPage = { cards: Card[]; page: number; hasMore: boolean; total: number };
const BOT_ID = "trial-bot";

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "処理に失敗しました");
  return body as T;
}
function toBattleCard(card: Card): BattleCard {
  const skills = Array.isArray(card.skills) ? card.skills.map((value, index) => {
    const skill = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const skillType = skill.skill_type === "passive" ? "passive" : "active";
    return { ...skill, slot: Number.isInteger(skill.slot) ? Number(skill.slot) : index + 1, skill_type: skillType, cost: skillType === "passive" ? 0 : 100, effects: Array.isArray(skill.effects) ? skill.effects : [] };
  }) : [];
  return {
    cardId: card.id, parentCardId: card.parent_card_id ?? null, instanceId: card.id, title: card.title, hp: Math.max(1, card.hp || 1), atk: Math.max(0, card.atk || 0),
    shield: Math.max(0, card.shield || 0), speed: Math.max(0, card.speed || 0), skills: skills as BattleCard["skills"],
    cardType: card.card_type, supportDefinition: card.support_definition ?? null,
  };
}
function supportTargets(state: BattleState, playerId: string, scope: string) {
  const owner = state.players[playerId]?.actors.filter((actor) => !actor.defeated) ?? [];
  const enemy = Object.values(state.players).find((player) => player.playerId !== playerId)?.actors.filter((actor) => !actor.defeated) ?? [];
  if (scope === "self" || scope === "ally_front") return owner.slice(0, 1);
  if (scope === "ally_support") return owner.slice(1, 2);
  if (scope === "all_allies") return owner;
  if (scope === "enemy_front") return enemy.slice(0, 1);
  if (scope === "enemy_support") return enemy.slice(1, 2);
  if (scope === "all_enemies") return enemy;
  return [];
}
function total(card: Card) { return card.hp + card.atk + card.shield + card.speed; }

const sampleCard = (card: BattleCard): Card => ({ id: card.cardId, title: card.title, description: card.skills[0]?.description ?? "味方の前衛を50 HP回復する、一度きりのサポート。", card_type: card.cardType ?? "action", hp: card.hp, atk: card.atk, shield: card.shield, speed: card.speed, skills: card.skills, scout_tier: card.cardId === "sample-aurora" ? "legend" : "elite", support_definition: card.supportDefinition });

export default function TrialBattleClient({ playerId, playerName, sampleMode = false }: { playerId: string; playerName: string; sampleMode?: boolean }) {
  const [seed, setSeed] = useState(42);
  const [tutorial, setTutorial] = useState(sampleMode);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayView, setReplayView] = useState<{ initial: BattleState; actions: BattleAction[] } | null>(null);
  const [motionReduced, setMotionReduced] = useState(false);
  const replayRef = useRef<{ initial: BattleState; actions: BattleAction[] } | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState("");
  const [deckRows, setDeckRows] = useState<DeckRow[]>([]);
  const [opponents, setOpponents] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalOpponents, setTotalOpponents] = useState(0);
  const [opponentId, setOpponentId] = useState("");
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [botMessage, setBotMessage] = useState("");
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const flickRef = useRef<{ instanceId: string; x: number; y: number } | null>(null);
  const suppressCardClickRef = useRef(false);
  const botTurnRef = useRef<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSeed = Number(params.get("seed") ?? 42);
    if (Number.isSafeInteger(requestedSeed) && requestedSeed >= 0 && requestedSeed <= 4294967295) setSeed(requestedSeed);
    let reduced = false; try { reduced = localStorage.getItem("lll-motion") === "reduced"; } catch { /* Storage may be unavailable in private mode. */ }
    setMotionReduced(reduced); document.documentElement.dataset.motion = reduced ? "reduced" : "full";
    return () => { delete document.documentElement.dataset.motion; };
  }, []);
  const toggleMotion = () => { const next = !motionReduced; setMotionReduced(next); document.documentElement.dataset.motion = next ? "reduced" : "full"; try { localStorage.setItem("lll-motion", next ? "reduced" : "full"); } catch { /* Optional browser preference. */ } };

  const loadOpponents = useCallback(async (nextPage = 0, nextQuery = query, append = false) => {
    const params = new URLSearchParams({ page: String(nextPage) });
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    const result = await readJson<OpponentPage>(await fetch(`/api/trial-opponents?${params}`));
    setOpponents((current) => append ? [...current, ...result.cards] : result.cards);
    setPage(result.page); setHasMore(result.hasMore); setTotalOpponents(result.total);
    if (!append && result.cards.length && !result.cards.some((card) => card.id === opponentId)) setOpponentId(result.cards[0].id);
  }, [query, opponentId]);

  useEffect(() => {
    let live = true;
    if (sampleMode) {
      setDecks([{ id: "starter", name: "ORIGIN / はじまりのデッキ" }]); setDeckId("starter");
      setDeckRows(STARTER_CARDS.map((card) => ({ role: card.cardType ?? "action", card: sampleCard(card) })));
      setOpponents([sampleCard(STARTER_OPPONENT)]); setOpponentId(STARTER_OPPONENT.cardId); setTotalOpponents(1); setLoading(false);
      return;
    }
    void (async () => {
      try {
        const [deckResult, opponentResult] = await Promise.all([
          readJson<{ decks: Deck[] }>(await fetch("/api/decks")),
          readJson<OpponentPage>(await fetch("/api/trial-opponents?page=0")),
        ]);
        if (!live) return;
        const list = deckResult.decks ?? [];
        setDecks(list);
        const requested = new URLSearchParams(window.location.search).get("deckId");
        const initial = list.find((deck) => deck.id === requested)?.id ?? list[0]?.id ?? "";
        setDeckId(initial);
        setOpponents(opponentResult.cards ?? []); setPage(0); setHasMore(opponentResult.hasMore); setTotalOpponents(opponentResult.total);
        setOpponentId(opponentResult.cards?.[0]?.id ?? "");
        if (initial) {
          const detail = await readJson<{ cards: DeckRow[] }>(await fetch(`/api/decks/${initial}`));
          if (live) setDeckRows(detail.cards ?? []);
        }
        if (live) setLoading(false);
      } catch (caught) {
        if (live) { setError(caught instanceof Error ? caught.message : "準備できませんでした"); setLoading(false); }
      }
    })();
    return () => { live = false; };
  }, [sampleMode]);

  const actions = useMemo(() => deckRows.filter((row) => row.role === "action" && row.card).map((row) => row.card as Card), [deckRows]);
  const supports = useMemo(() => deckRows.filter((row) => row.role === "support" && row.card).map((row) => row.card as Card), [deckRows]);
  const parts = useMemo(() => deckRows.filter((row) => row.role === "part" && row.card).map((row) => row.card as Card), [deckRows]);
  const selectedOpponent = opponents.find((card) => card.id === opponentId) ?? null;

  const start = () => {
    if (!selectedOpponent || !actions.length) return;
    try {
      const playerCards = actions.map(toBattleCard);
      const hand = [...playerCards.slice(1), ...supports.map((card) => toBattleCard(card)), ...parts.map((card) => toBattleCard(card))];
      const next = createBattle({
        battleId: `trial-${crypto.randomUUID()}`, firstPlayerId: playerId, seed, defeatTarget: 1,
        players: [
          { playerId, cards: playerCards, initialFieldCardIds: playerCards.slice(0, 1).map((card) => card.cardId), hand },
          { playerId: BOT_ID, cards: [toBattleCard(selectedOpponent)], initialFieldCardIds: [selectedOpponent.id] },
        ],
      });
      replayRef.current = { initial: structuredClone(next), actions: [] };
      setSelectedActorId(null); setSelectedHandCardId(null); botTurnRef.current = null; setReplayOpen(false);
      setBattle(next); setError(""); setBotMessage("試し切り開始。相手は技1だけを使います。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "試合を開始できませんでした"); }
  };

  const act = (type: "use_skill" | "use_support" | "end_turn" | "play_action" | "equip_part", payload: Record<string, unknown> = {}) => {
    if (!battle || busy || battle.phase !== "active" || battle.activePlayerId !== playerId) return;
    setBusy(true); setError("");
    try {
      const action = { actionId: crypto.randomUUID(), battleId: battle.battleId, expectedVersion: battle.version, playerId, type, ...payload } as BattleAction;
      const next = applyAction(battle, action); replayRef.current?.actions.push(action); setBattle(next);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "操作できませんでした"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!battle || battle.phase !== "active" || battle.activePlayerId !== BOT_ID || botTurnRef.current === battle.turn) return;
    botTurnRef.current = battle.turn;
    const source = battle.players[BOT_ID]?.actors.find((actor) => !actor.defeated);
    const skill = source?.skills.find((item) => item.slot === 1);
    const cost = skill?.skill_type === "passive" ? 0 : 100;
    const targets = battle.players[playerId]?.actors.filter((actor) => !actor.defeated) ?? [];
    setBotMessage("CPUが盤面を確認しています…");
    const timer = window.setTimeout(() => {
      try {
        let next = battle;
        let usedSkill = false;
        if (source && skill && source.ap >= cost && targets.length) {
          try {
            const action: BattleAction = { actionId: crypto.randomUUID(), battleId: next.battleId, expectedVersion: next.version, playerId: BOT_ID, type: "use_skill", actorInstanceId: source.instanceId, skillSlot: 1, targetInstanceIds: targets.map((actor) => actor.instanceId) };
            next = applyAction(next, action); replayRef.current?.actions.push(action);
            usedSkill = true;
          } catch { /* An unsatisfied skill condition means this CPU turn ends without a move. */ }
        }
        setBotMessage(usedSkill ? "技を使用" : "ターン終了");
        if (next.phase === "active" && next.activePlayerId === BOT_ID) {
          const action: BattleAction = { actionId: crypto.randomUUID(), battleId: next.battleId, expectedVersion: next.version, playerId: BOT_ID, type: "end_turn" };
          next = applyAction(next, action); replayRef.current?.actions.push(action);
        }
        setBattle(next);
      } catch (caught) { setError(caught instanceof Error ? caught.message : "CPU行動に失敗しました"); }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [battle, playerId]);

  const playerActors = battle?.players[playerId]?.actors ?? [];
  const botActors = battle?.players[BOT_ID]?.actors ?? [];
  const handCards = battle?.players[playerId]?.hand ?? [];
  const actor = playerActors.find((item) => !item.defeated);
  const selectedActor = selectedActorId ? playerActors.find((item) => item.instanceId === selectedActorId) ?? null : null;
  const selectedHandCard = selectedHandCardId ? handCards.find((item) => (item.instanceId ?? item.cardId) === selectedHandCardId) ?? null : null;
  const myTurn = Boolean(battle && battle.phase === "active" && battle.activePlayerId === playerId);
  const sourceForCard = (card: BattleCard) => [...actions, ...supports, ...parts].find((item) => item.id === card.cardId);
  const playActionCard = (instanceId: string) => act("play_action", { cardInstanceId: instanceId });
  const equipPartCard = (partInstanceId: string, targetInstanceId: string) => act("equip_part", { partInstanceId, targetInstanceId });

  const playSupport = (card: Card) => {
    if (!battle || !card.support_definition) return;
    const targets = supportTargets(battle, playerId, card.support_definition.target_scope);
    if (!targets.length) { setError("このサポートの対象がいません。"); return; }
    const handCard = battle.players[playerId]?.hand.find((item) => item.cardId === card.id);
    if (!handCard) return;
    act("use_support", { supportInstanceId: handCard.instanceId ?? handCard.cardId, targetInstanceIds: targets.map((item) => item.instanceId) });
  };
  const playHandSupport = (instanceId: string) => {
    const handCard = handCards.find((item) => (item.instanceId ?? item.cardId) === instanceId);
    const source = handCard ? sourceForCard(handCard) : undefined;
    if (source) playSupport(source);
  };
  const beginFlick = (instanceId: string, event: ReactPointerEvent) => { flickRef.current = { instanceId, x: event.clientX, y: event.clientY }; setDraggingCardId(instanceId); suppressCardClickRef.current = false; };
  const finishFlick = (target: "center" | string, event: ReactPointerEvent) => {
    const start = flickRef.current; flickRef.current = null; setDraggingCardId(null); if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y); if (distance < 42) return;
    suppressCardClickRef.current = true;
    const card = handCards.find((item) => (item.instanceId ?? item.cardId) === start.instanceId);
    if (!card) return;
    const cardType = card.cardType as "action" | "support" | "part" | undefined;
    if (target === "center" && cardType === "action") playActionCard(start.instanceId);
    else if (target === "center" && cardType === "support") playHandSupport(start.instanceId);
    else if (cardType === "part" && target !== "center") equipPartCard(start.instanceId, target);
    else setError(cardType === "part" ? "パーツは装着先のアクションカードへフリックしてください" : "中央の場へフリックしてください");
    window.setTimeout(() => { suppressCardClickRef.current = false; }, 0);
  };

  if (loading) return <main className="trial-shell"><div className="empty-state"><span className="loading-ring"/><h1>試し切りを準備しています</h1></div></main>;
  if (!battle) return <main className="trial-shell">
    <header className="trial-header"><Link scroll={false} className="back-link" href="/battle"><ArrowLeft size={16}/>バトルロビー</Link><div><h1>試し切り</h1></div><FullscreenButton /><span className="trial-mark"><Swords size={20}/> TRAINING</span></header>
    <section className="practice-intro"><div><span className="overline">ORIGIN / PRACTICE ARENA</span><h2>{sampleMode ? "最初の一戦を、ここから。" : "その一枚の可能性を、試そう。"}</h2><p>{sampleMode ? "ログイン・生成待ち不要。サンプルカードで、配置・技・サポートを体験できます。" : "保存済みデッキで練習。対人戦の戦績には影響しません。"}</p></div><div className="practice-options"><label><input type="checkbox" checked={tutorial} onChange={(event) => setTutorial(event.target.checked)} />操作ガイド</label><label>乱数seed <input aria-label="乱数seed" type="number" min="0" max="4294967295" value={seed} onChange={(event) => { const next = Number(event.target.value); if (Number.isSafeInteger(next) && next >= 0 && next <= 4294967295) setSeed(next); }} /></label><button className="text-button" onClick={toggleMotion} aria-pressed={motionReduced}>演出 {motionReduced ? "控えめ" : "通常"}</button></div></section>
    <div className="trial-setup-grid">
      <section className="trial-setup-panel"><div className="step-title"><span>01</span><div><p className="overline">YOUR LOADOUT</p><h2>使用デッキ</h2></div></div>
        {decks.length ? <><label className="trial-select-field"><span>試し切りする編成</span><select disabled={sampleMode} value={deckId} onChange={async (event) => { const id = event.target.value; setDeckId(id); setError(""); try { const result = await readJson<{ cards: DeckRow[] }>(await fetch(`/api/decks/${id}`)); setDeckRows(result.cards ?? []); } catch (caught) { setError(caught instanceof Error ? caught.message : "デッキを読み込めませんでした"); } }}>{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}</select></label>
          <div className="trial-loadout-row">{actions.slice(0, 2).map((card) => <div key={card.id} className="trial-loadout-card"><CardDisplay card={card} size="small"/><b>{card.title}</b></div>)}{actions.length === 0 && <p className="mini-empty">このデッキにアクションカードがありません。編成から追加してください。</p>}</div>
          <p className="trial-rule-note"><Shield size={15}/>サポート {supports.length}枚 ・ 先頭1枚のアクションを配置</p><Link scroll={false} className="text-button" href="/decks">デッキを編集 <ArrowRight size={14}/></Link></> : <div className="mini-empty"><p>試し切りにはアクションカード入りのデッキが必要です。</p><Link scroll={false} className="secondary-button" href="/decks">編成を作る <ArrowRight size={14}/></Link></div>}
      </section>
      <section className="trial-setup-panel opponent-picker"><div className="step-title"><span>02</span><div><p className="overline">PRACTICE TARGET</p><h2>試し切り相手を選ぶ</h2></div><span className="count-pill">{sampleMode ? "練習専用" : `公開 ${totalOpponents} 枚`}</span></div>
        <form hidden={sampleMode} className="trial-search" onSubmit={(event) => { event.preventDefault(); setError(""); void loadOpponents(0, query, false).catch((caught) => setError(caught instanceof Error ? caught.message : "検索できませんでした")); }}><label className="search-field"><Search size={16}/><span className="sr-only">相手カード検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="カード名で探す"/></label><button className="secondary-button" type="submit">検索</button></form>
        {opponents.length ? <div className="trial-opponent-grid">{opponents.map((card) => <button key={card.id} type="button" className={`trial-opponent-choice ${opponentId === card.id ? "selected" : ""}`} aria-pressed={opponentId === card.id} onClick={() => setOpponentId(card.id)}><CardDisplay card={card} size="small" imageSrc={card.imageSrc}/><span className="trial-opponent-title">{card.title}</span><span className="trial-card-total">総合値 {total(card)}</span><span className="trial-choice-mark"><Check size={15}/></span></button>)}</div> : <div className="empty-state"><Sparkles size={25}/><h3>公開中のカードがありません</h3><p>バインダーでカードを試し切り相手として公開できます。</p><Link scroll={false} className="secondary-button" href="/binder">バインダーへ</Link></div>}
        <div hidden={sampleMode} className="trial-pagination"><span>{opponents.length ? `${page + 1}ページ目` : "候補なし"}</span><button className="secondary-button" disabled={page === 0} onClick={() => { setError(""); void loadOpponents(Math.max(0, page - 1), query, false); }}><ChevronLeft size={15}/>前</button><button className="secondary-button" disabled={!hasMore} onClick={() => { setError(""); void loadOpponents(page + 1, query, false); }}>次<ChevronRight size={15}/></button></div>
      </section>
    </div>
    <footer className="trial-start-bar"><div><b>{selectedOpponent?.title ?? "相手を選択"}</b></div><button className="primary-button" disabled={!actions.length || !selectedOpponent} onClick={start}><Swords size={17}/>試し切り開始 <ArrowRight size={16}/></button></footer>
    {error && <p className="form-feedback error-text" role="alert">{error}</p>}
  </main>;

  const exportReplay = () => {
    if (!replayRef.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "lll-practice-replay-v1", ...replayRef.current }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `lll-practice-${seed}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const shareResult = async () => {
    const url = new URL("/practice", window.location.origin); url.searchParams.set("seed", String(seed));
    const text = `LLLの練習バトルを${battle.turn}ターンで${battle.winnerPlayerId === playerId ? "クリア" : "プレイ"}！ 同じseedで挑戦してみよう。`;
    try { if (navigator.share) await navigator.share({ title: "LLL / PRACTICE", text, url: url.href }); else { await navigator.clipboard.writeText(`${text} ${url.href}`); setBotMessage("練習リンクをコピーしました。カードや手札は公開していません。"); } } catch { setBotMessage("共有を終了しました。試合はそのまま保持されています。"); }
  };
  const lastCombat = [...battle.events].reverse().find((event) => ["damage_applied", "heal_applied", "actor_defeated", "shield_changed"].includes(event.type));
  const maxDamage = Math.max(0, ...battle.events.map((event) => Number(event.payload.damage) || 0));
  const usedSkills = battle.events.filter((event) => event.type === "action_accepted" && event.sourceActorId?.startsWith(playerId)).length;
  const tutorialText = !battle.events.some((event) => event.type === "action_accepted") ? "場のカードを選び、技を使おう。100 APで攻撃できます。" : actor && actor.ap < 100 ? "APが100未満の時はターン終了。自分のターン開始でSPD分回復します。" : "手札を選んで配置・サポートを試そう。フリックの代わりにボタンも使えます。";
  const outcome = battle.phase === "finished" ? battle.winnerPlayerId === playerId ? "勝利" : "敗北" : null;
  return <main className="trial-shell trial-live-shell">
    <header className="trial-live-header"><Link scroll={false} className="back-link" href="/battle"><ArrowLeft size={16}/>ロビーへ戻る</Link><div><h1>試し切り</h1></div><span className={`trial-turn-chip ${myTurn ? "my-turn" : ""}`}><i/>{outcome ?? (myTurn ? "あなたのターン" : "CPUのターン")} <small>TURN {battle.turn}</small></span><button className="battle-log-menu-button" aria-label="バトルログを開く" onClick={() => setLogOpen(true)}><Menu size={18}/><span>ログ</span></button><FullscreenButton /></header>
    {outcome ? <section className={`trial-result ${outcome === "勝利" ? "win" : "lose"}`}><div className="result-medallion"><Trophy size={38}/></div><p className="overline">{outcome === "勝利" ? "VICTORY" : "NEXT CHALLENGE"}</p><h2>{outcome}</h2><p>{outcome === "勝利" ? "相手カードのHPを0にして、勝利をつかみました。" : "自分のカードのHPが0になりました。次はサポートを使ってみよう。"}</p><div className="practice-result-stats"><div><small>経過ターン</small><b>{battle.turn}</b></div><div><small>試合最大ダメージ</small><b>{maxDamage}</b></div><div><small>あなたの技使用</small><b>{usedSkills}</b></div></div><p className="practice-result-hint">ヒント：APはカードごとに独立。足りない時はターンを終えて回復しよう。</p><div className="trial-result-actions"><button className="primary-button" onClick={start}><RefreshCw size={16}/>同じデッキで再戦</button><button className="secondary-button" onClick={() => { setReplayView(replayRef.current ? structuredClone(replayRef.current) : null); setReplayOpen(true); }}><Play size={16}/>リプレイを見る</button><button className="secondary-button" onClick={() => void shareResult()}><Share2 size={16}/>友人に挑戦を送る</button><button className="secondary-button" onClick={exportReplay}><Download size={16}/>リプレイJSON</button><Link scroll={false} className="secondary-button" href={sampleMode ? "/login" : "/decks"}>{sampleMode ? "自分のカードを作る" : "デッキを編集"}</Link><button className="text-button" onClick={() => { setBattle(null); botTurnRef.current = null; }}>相手を選び直す</button></div><small>ローカル練習戦 · 戦績・報酬なし · SEED {seed}</small>{botMessage && <p role="status">{botMessage}</p>}</section> : <><div className="practice-live-tools">{tutorial && <p className="practice-coach" role="status"><BookOpen size={18}/>{tutorialText}<button onClick={() => setTutorial(false)} aria-label="操作ガイドを閉じる"><X size={16}/></button></p>}<button className="text-button" onClick={toggleMotion} aria-pressed={motionReduced}>演出 {motionReduced ? "控えめ" : "通常"}</button><button className="text-button" onClick={() => setTutorial((current) => !current)}>ガイド {tutorial ? "ON" : "OFF"}</button></div><div className="trial-arena-grid">
      <section className="trial-board"><div className="trial-side-heading enemy"><span className="trial-avatar bot"><Sparkles size={15}/></span><div><b>練習CPU</b></div><span className="side-indicator">CPU</span></div><div className="trial-card-row enemy-row">{botActors.map((item) => { const source = selectedOpponent; const card = { ...(source ?? { id: item.cardId, title: item.title }), ...item, id: item.cardId, card_type: "action" }; return <article key={item.instanceId} className={`trial-field-card ${item.defeated ? "defeated" : ""}`}><CardDisplay card={card} size="medium" imageSrc={source?.imageSrc}/><div className="trial-hp"><span>HP</span><b>{Math.max(0, item.hp)}</b><i><em style={{ width: `${Math.max(0, Math.min(100, 100 * item.hp / Math.max(item.maxHp, 1)))}%` }}/></i></div>{item.defeated && <span className="defeat-stamp">DEFEATED</span>}</article>; })}</div>
        <div className="practice-combat-feedback" key={lastCombat?.eventId} role="status">{lastCombat ? `${practiceEventLabel(lastCombat.type)}${lastCombat.payload.damage !== undefined ? ` ${lastCombat.payload.damage}` : lastCombat.payload.amount !== undefined ? ` +${lastCombat.payload.amount}` : ""}` : "READY / あなたの切り札を選ぼう"}</div><div className="trial-vs-line"><span>TURN {battle.turn}</span><b>VS</b><span>{myTurn ? "YOUR TURN" : "CPU THINKING"}</span></div>
        <div className={`trial-play-zone ${draggingCardId ? "is-drop-target" : ""}`} onPointerUp={(event) => finishFlick("center", event)}><b>{draggingCardId ? "ここにカードを出す" : "PLAY ZONE"}</b></div>
        <div className="trial-card-row own-row">{playerActors.map((item) => { const source = actions.find((card) => card.id === item.cardId); const card = { ...(source ?? { id: item.cardId, title: item.title }), ...item, id: item.cardId, card_type: "action" }; const isPartTarget = draggingCardId && handCards.find((handCard) => (handCard.instanceId ?? handCard.cardId) === draggingCardId)?.cardType === "part"; return <article key={item.instanceId} className={`trial-field-card ${item.defeated ? "defeated" : ""} ${selectedActor?.instanceId === item.instanceId ? "selected" : ""} ${isPartTarget && !item.defeated ? "is-card-target" : ""}`} onPointerUp={(event) => finishFlick(item.instanceId, event)} role="button" tabIndex={item.defeated ? -1 : 0} aria-label={`${item.title}の技を選択、AP ${item.ap}`} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !item.defeated) { event.preventDefault(); setSelectedActorId(item.instanceId); } }} onClick={() => !item.defeated && !suppressCardClickRef.current && setSelectedActorId(item.instanceId)}><CardDisplay card={card} size="medium"/><div className="trial-hp"><span>HP</span><b>{Math.max(0, item.hp)}</b><i><em style={{ width: `${Math.max(0, Math.min(100, 100 * item.hp / Math.max(item.maxHp, 1)))}%` }}/></i></div><div className="trial-ap"><span>AP</span><b>{item.ap}</b><small>/ {item.maxAp}</small></div>{item.defeated && <span className="defeat-stamp">DEFEATED</span>}</article>; })}</div><div className="trial-side-heading ally"><span className="trial-avatar">{playerName.slice(0, 1)}</span><div><b>{playerName}</b></div><span className="side-indicator">YOU</span></div>
      </section>
      <aside className="trial-commands"><section className="trial-command-panel"><div className="section-title-row"><div><h2>行動選択</h2></div><Clock3 size={17}/></div><div className="trial-active-card"><span>行動するカード</span><b>{actor?.title ?? "行動不能"}</b><small>AP {actor?.ap ?? 0} / {actor?.maxAp ?? 0}</small></div>
        {supports.length > 0 && <div className="trial-supports"><div className="support-hand-heading"><b>サポート</b><span>AP消費なし</span></div>{supports.map((card) => <article key={card.id} className="trial-support-row"><div><b>{card.title}</b><small>{card.description || "サポートカード"}</small></div><button className="secondary-button" disabled={!myTurn || busy || !handCards.some((item) => item.cardId === card.id) || !card.support_definition || card.support_definition.timing !== "on_play"} onClick={() => playSupport(card)}>使用</button></article>)}</div>}
        <button className="secondary-button trial-end-turn" disabled={!myTurn || busy} onClick={() => act("end_turn")}>ターンを終了 <ArrowRight size={15}/></button>{error && <p className="form-feedback error-text" role="alert">{error}</p>}{botMessage && <p className="trial-bot-message" role="status">{botMessage}</p>}</section>
      </aside>
      <section className="minimal-hand trial-hand"><div className="minimal-hand-heading"><div><b>手札</b><small>CARDS IN HAND · {handCards.length}枚</small></div></div><div className="minimal-hand-row">{handCards.length ? handCards.map((card) => { const source = sourceForCard(card); const display = { id: source?.id ?? card.cardId, title: card.title, description: source?.description ?? null, card_type: card.cardType, hp: card.hp, atk: card.atk, shield: card.shield, speed: card.speed, generation_status: "ready" }; const instanceId = card.instanceId ?? card.cardId; return <div key={instanceId} className={`minimal-hand-card card-3d ${draggingCardId === instanceId ? "is-dragging" : ""}`} role="button" tabIndex={0} aria-label={`${card.title}の手札詳細`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedHandCardId(instanceId); } }} onPointerDown={(event) => { if (myTurn) beginFlick(instanceId, event); }} onPointerUp={(event) => finishFlick("center", event)} onPointerCancel={() => { flickRef.current = null; setDraggingCardId(null); }} onClick={() => { if (!suppressCardClickRef.current) setSelectedHandCardId(instanceId); }}><CardDisplay card={display} size="small" showStats={false} imageSrc={source?.imageSrc}/><span className="hand-card-type">{card.cardType === "support" ? "SUPPORT" : card.cardType === "part" ? "PART" : "ACTION"}</span></div>; }) : <div className="minimal-empty">手札はありません</div>}</div><div className="minimal-zone-summary"><span>手札 {handCards.length}</span><span>捨て札 {battle.players[playerId]?.discard.length ?? 0}</span></div></section>
    </div></>}
    {replayOpen && replayView && <PracticeReplay initial={replayView.initial} actions={replayView.actions} onClose={() => setReplayOpen(false)} />}
    {selectedHandCard && <TrialHandCardModal card={selectedHandCard} source={sourceForCard(selectedHandCard)} canAct={myTurn && !busy} targets={playerActors.filter((item) => !item.defeated && item.cardId === selectedHandCard.parentCardId && item.equippedPartIds.length < 2)} onEquip={(targetId) => { equipPartCard(selectedHandCard.instanceId ?? selectedHandCard.cardId, targetId); setSelectedHandCardId(null); }} onClose={() => setSelectedHandCardId(null)} onPlay={() => { const instanceId = selectedHandCard.instanceId ?? selectedHandCard.cardId; if (selectedHandCard.cardType === "action") playActionCard(instanceId); else if (selectedHandCard.cardType === "support") playHandSupport(instanceId); setSelectedHandCardId(null); }} />}
    {selectedActor && <TrialCardActionModal actor={selectedActor} source={actions.find((card) => card.id === selectedActor.cardId)} canAct={myTurn && !busy} onClose={() => setSelectedActorId(null)} onSkill={(slot) => { act("use_skill", { actorInstanceId: selectedActor.instanceId, skillSlot: slot, targetInstanceIds: botActors.filter((target) => !target.defeated).map((target) => target.instanceId) }); setSelectedActorId(null); }} />}
    {logOpen && <TrialLogDrawer events={battle.events} onClose={() => setLogOpen(false)} />}
  </main>;
}
function TrialHandCardModal({ card, source, canAct, targets, onEquip, onClose, onPlay }: { card: BattleCard; source?: Card; canAct: boolean; targets: BattleState["players"][string]["actors"]; onEquip: (id: string) => void; onClose: () => void; onPlay: () => void }) {
  const displayCard: DisplayCard = { id: source?.id ?? card.cardId, title: card.title, description: source?.description ?? null, card_type: card.cardType, hp: card.hp, atk: card.atk, shield: card.shield, speed: card.speed, generation_status: "ready" };
  const skills: CardSkillDisplay[] = card.skills.map((skill) => ({ slot: skill.slot, name: skill.name, description: skill.description, cost: skill.cost, skillType: skill.skill_type, disabled: true }));
  const dialogRef = usePracticeDialog(onClose);
  return <div className="battle-modal-backdrop" role="presentation" onClick={onClose}><section className="battle-card-modal battle-card-modal-frame" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${card.title}の手札詳細`} onClick={(event) => event.stopPropagation()}><button type="button" className="battle-modal-close" onClick={onClose} aria-label="手札カード詳細を閉じる"><X size={18}/></button><CardDisplay card={displayCard} imageSrc={source?.imageSrc} size="large" showStats showDescription={Boolean(source?.description)} showSkills={card.cardType === "action"} skills={skills} stateLabel="HAND / 手札" actionLabel={card.cardType === "action" ? "このアクションを場に出す" : card.cardType === "support" ? "サポートを使用する" : "装着先へフリック"} actionDisabled={!canAct || card.cardType === "part"} onAction={card.cardType === "part" ? undefined : onPlay} className="battle-detail-card" />{card.cardType === "part" && <div className="practice-part-targets">{targets.length ? targets.map((target) => <button key={target.instanceId} className="primary-button" disabled={!canAct} onClick={() => onEquip(target.instanceId)}>{target.title}に装着</button>) : <p>合法な装着先がありません。親カードを場に配置してください。</p>}</div>}</section></div>;
}
function TrialCardActionModal({ actor, source, canAct, onClose, onSkill }: { actor: BattleState["players"][string]["actors"][number]; source?: Card; canAct: boolean; onClose: () => void; onSkill: (slot: number) => void }) {
  const displayCard: DisplayCard = { id: source?.id ?? actor.cardId, title: actor.title, description: source?.description ?? null, card_type: "action", hp: actor.hp, atk: actor.atk, shield: actor.def, speed: actor.speed, generation_status: "ready" };
  const skills: CardSkillDisplay[] = actor.skills.map((skill) => ({ slot: skill.slot, name: skill.name, description: skill.description, cost: skill.cost, skillType: skill.skill_type, disabled: !canAct || skill.skill_type === "passive" || actor.ap < skill.cost }));
  const dialogRef = usePracticeDialog(onClose);
  return <div className="battle-modal-backdrop" role="presentation" onClick={onClose}><section className="battle-card-modal battle-card-modal-frame" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${actor.title}の詳細`} onClick={(event) => event.stopPropagation()}><button type="button" className="battle-modal-close" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label="カード詳細を閉じる"><X size={18}/></button><CardDisplay card={displayCard} imageSrc={source?.imageSrc} size="large" showStats showDescription showSkills skills={skills} ap={actor.ap} maxAp={actor.maxAp} stateLabel="FIELD / 場" onSkillSelect={onSkill} className="battle-detail-card" /></section></div>;
}
function TrialLogDrawer({ events, onClose }: { events: BattleState["events"]; onClose: () => void }) {
  const dialogRef = usePracticeDialog(onClose);
  return <div className="battle-log-backdrop" role="presentation" onClick={onClose}><aside className="battle-log-drawer" ref={dialogRef} role="dialog" aria-modal="true" aria-label="バトルログ" onClick={(event) => event.stopPropagation()}><div className="battle-log-drawer-header"><div><span className="overline">BATTLE LOG</span><h2>行動履歴</h2></div><button className="battle-modal-close" onClick={onClose} aria-label="バトルログを閉じる"><X size={18}/></button></div>{events.length ? <ol>{events.slice(-24).reverse().map((event) => <li key={event.eventId}><span>{event.sequence}</span><div><b>{practiceEventLabel(event.type)}</b><small>TURN {event.turn}</small></div></li>)}</ol> : <p className="mini-empty">まだ行動ログはありません。</p>}</aside></div>;
}
function practiceEventLabel(type: string) {
  const labels: Record<string, string> = { action_accepted: "技を発動", damage_applied: "ダメージ", counter_damage_applied: "反撃", follow_up_damage_applied: "追撃", heal_applied: "回復", ap_changed: "AP変化", actor_defeated: "カードが倒れた", battle_finished: "試合終了", support_play_accepted: "サポート使用", support_triggered: "サポート発動", support_effect_applied: "サポート効果", support_discarded: "サポート消費", turn_ended: "ターン終了", support_play_rejected: "サポート不発" };
  return labels[type] ?? type.replaceAll("_", " ");
}

function PracticeReplay({ initial, actions, onClose }: { initial: BattleState; actions: BattleAction[]; onClose: () => void }) {
  const dialogRef = usePracticeDialog(onClose);
  const [step, setStep] = useState(0);
  const frames = useMemo(() => { const states = [initial]; for (const action of actions) states.push(applyAction(states[states.length - 1], action)); return states; }, [initial, actions]);
  const frame = frames[step];
  return <div className="battle-modal-backdrop" onClick={onClose}><section className="practice-replay" ref={dialogRef} role="dialog" aria-modal="true" aria-label="練習リプレイ" onClick={(event) => event.stopPropagation()}><button className="battle-modal-close" onClick={onClose} aria-label="リプレイを閉じる"><X size={18}/></button><span className="overline">DETERMINISTIC REPLAY</span><h2>あの一手を、もう一度。</h2><p>TURN {frame.turn} · 操作 {step} / {actions.length} · SEED {frame.seed}</p><div className="replay-actors">{Object.values(frame.players).map((player) => <div key={player.playerId}><b>{player.playerId === BOT_ID ? "CPU" : "あなた"}</b>{player.actors.map((actor) => <p key={actor.instanceId}>{actor.title}<strong>HP {actor.hp} / AP {actor.ap}</strong></p>)}</div>)}</div><input aria-label="リプレイの操作位置" type="range" min="0" max={actions.length} value={step} onChange={(event) => setStep(Number(event.target.value))}/><div className="trial-result-actions"><button className="secondary-button" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>前の一手</button><button className="primary-button" disabled={step === actions.length} onClick={() => setStep((value) => value + 1)}>次の一手</button></div><p>{frame.events.length ? practiceEventLabel(frame.events[frame.events.length - 1].type) : "試合開始"}</p><small>カード定義を含む初期状態と操作列から再計算しています。対人戦の公開リプレイではありません。</small></section></div>;
}

/** All practice dialogs contain keyboard focus and restore it on close. */
function usePracticeDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current; if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
    focusables()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab") {
        const elements = focusables(); const first = elements[0]; const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    const bodyOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = bodyOverflow; previous?.focus(); };
  }, []);
  return dialogRef;
}
