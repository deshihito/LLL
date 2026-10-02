"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Crosshair, Layers3, Plus, Swords, Zap } from "lucide-react";
import AuthButtons from "@/components/auth-buttons";

type Card = {
  id: number;
  name: string;
  type: "ACTION" | "PART" | "SUPPORT";
  color: string;
  hp: number;
  atk: number;
  shield: number;
  speed: number;
};

const cards: Card[] = [
  { id: 1, name: "NEON WOLF", type: "ACTION", color: "violet", hp: 420, atk: 160, shield: 110, speed: 80 },
  { id: 2, name: "VOID BLADE", type: "PART", color: "cyan", hp: 0, atk: 70, shield: 0, speed: 20 },
  { id: 3, name: "ARC CORE", type: "PART", color: "orange", hp: 0, atk: 40, shield: 55, speed: 15 },
  { id: 4, name: "SHELTER", type: "SUPPORT", color: "green", hp: 100, atk: 0, shield: 100, speed: 10 },
];

export default function Home() {
  const [active, setActive] = useState("HOME");
  const [deck, setDeck] = useState<number[]>([1, 2, 3]);
  const deckComplete = deck.length === 20;
  const primaryCard = useMemo(() => cards[0], []);

  const addCard = (id: number) => {
    if (deck.length >= 20 || deck.includes(id)) return;
    setDeck((current) => [...current, id]);
  };

  return (
    <main className="lll-shell">
      <header className="lll-header">
        <div className="brand"><span className="brand-mark">✦</span><span>LLL</span><small>LIKE LIKE LIKE</small></div>
        <div className="header-stats"><span>LV. 12</span><span className="rank-dot" /> <span>ROOKIE</span><span className="avatar">A</span></div>
      </header>

      <section className="lll-content">
        <div className="eyebrow">{active === "HOME" ? "MAIN HUB / 01" : `MODULE / ${active}`}</div>
        {active === "HOME" ? (
          <>
            <div className="hero-grid">
              <div className="hero-copy">
                <p className="kicker">CARD ACTION SYSTEM</p>
                <h1>好きに、自分の<br /><em>カード</em>を作ろう。</h1>
                <p className="hero-text">画像から生まれる、あなただけのバトルカード。<br />組み合わせて、戦場へ。</p>
                <button className="primary-button" onClick={() => setActive("CREATE")}><Plus size={17} /> カードを生成 <ArrowRight size={16} /></button>
              </div>
              <div className="showcase"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="showcase-card"><span className="card-label">ACTION / 001</span><div className="card-symbol">✦</div><strong>{primaryCard.name}</strong><span className="card-sub">PRISM FANG UNIT</span><div className="card-stats"><b>{primaryCard.hp}<small>HP</small></b><b>{primaryCard.atk}<small>ATK</small></b><b>{primaryCard.speed}<small>SPD</small></b></div></div><span className="scan-line" /></div>
            </div>

            <div className="section-heading"><span>QUICK ACCESS</span><span className="muted">{deck.length} / 20 DECK SLOTS</span></div>
            <div className="quick-grid">
              <button className="quick-card violet-border" onClick={() => setActive("CREATE")}><Zap /><span><b>カード生成</b><small>AI STUDIO / NEW</small></span><ArrowRight /></button>
              <button className="quick-card cyan-border" onClick={() => setActive("BINDER")}><BookOpen /><span><b>バインダー</b><small>{cards.length} CARDS</small></span><ArrowRight /></button>
              <button className="quick-card orange-border" onClick={() => setActive("DECK")}><Layers3 /><span><b>デッキ編成</b><small>{deck.length} / 20 SLOTS</small></span><ArrowRight /></button>
              <button className="quick-card green-border" onClick={() => setActive("BATTLE")}><Swords /><span><b>バトル</b><small>CPU / ONLINE</small></span><ArrowRight /></button>
            </div>
          </>
        ) : (
          <Module active={active} deck={deck} deckComplete={deckComplete} addCard={addCard} setActive={setActive} />
        )}
      </section>

      <nav className="bottom-nav">{[["HOME", "⌂"], ["CREATE", "+"], ["BINDER", "▦"], ["DECK", "◇"], ["BATTLE", "⚔"]].map(([label, icon]) => <button key={label} className={active === label ? "active" : ""} onClick={() => setActive(label)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="auth-strip"><span>ACCOUNT LINK</span><AuthButtons /></div>
    </main>
  );
}

function Module({ active, deck, deckComplete, addCard, setActive }: { active: string; deck: number[]; deckComplete: boolean; addCard: (id: number) => void; setActive: (value: string) => void }) {
  const title = { CREATE: "カード生成", BINDER: "カードバインダー", DECK: "デッキ編成", BATTLE: "バトルロビー" }[active] ?? active;
  return <div className="module"><div className="module-head"><div><p className="kicker">LLL / {active}</p><h2>{title}</h2></div><button className="ghost-button" onClick={() => setActive("HOME")}>ホームへ</button></div>{active === "CREATE" ? <div className="dropzone"><div className="upload-icon">＋</div><h3>画像をドロップ</h3><p>カードにしたい画像を選択してください</p><button className="primary-button">ファイルを選択 <ArrowRight size={16} /></button><span className="status-line">AI ENGINE READY / GEMINI</span></div> : active === "DECK" ? <div className="deck-panel"><div className="deck-count"><b>{deck.length}</b><span>/ 20 SLOTS</span><div className="progress"><i style={{ width: `${deck.length * 5}%` }} /></div></div><div className="card-grid">{cards.map((card) => <button key={card.id} className="mini-card" onClick={() => addCard(card.id)}><span className={`mini-art ${card.color}`}>✦</span><b>{card.name}</b><small>{card.type} · {card.atk} ATK</small></button>)}</div><button className="primary-button wide" disabled={!deckComplete}>{deckComplete ? "保存してバトルへ" : `あと ${20 - deck.length} 枠で保存可能`} <ArrowRight size={16} /></button></div> : active === "BATTLE" ? <div className="battle-lobby"><div className="battle-card"><Crosshair /><div><b>CPU TEST BATTLE</b><small>対戦デッキを選択して開始</small></div><button className="primary-button" onClick={() => alert("バトルロビーを準備中です")}>開始 <ArrowRight size={16} /></button></div><div className="battle-card dim"><Swords /><div><b>REALTIME MATCH</b><small>Supabase Realtime / ONLINE</small></div><span className="coming">SOON</span></div></div> : <div className="binder-grid">{cards.map((card) => <article key={card.id} className="binder-card"><span className={`mini-art ${card.color}`}>✦</span><div><span className="card-type">{card.type}</span><h3>{card.name}</h3><small>HP {card.hp} / ATK {card.atk}</small></div></article>)}</div>}</div>;
}
