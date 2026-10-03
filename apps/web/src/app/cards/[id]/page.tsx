"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { CardDisplay, type DisplayCard } from "@/components/card-display";

const effectLabels: Record<string, string> = { damage: "ダメージ", heal: "回復", stat_modifier: "能力値変化", ap_change: "AP変化", shield_change: "シールド変化", status_apply: "状態異常", status_remove: "状態解除", equip_part: "パーツ装備", unequip_part: "パーツ解除", counter: "反撃", follow_up: "追撃" };
const statusLabels: Record<string, string> = { stun: "スタン", burn: "やけど", guard_break: "ガードブレイク", overdrive: "オーバードライブ" };
const statLabels: Record<string, string> = { max_hp: "最大HP", atk: "攻撃力", shield: "シールド", speed: "スピード" };
const targetLabels: Record<string, string> = { self: "自身", ally_front: "味方前衛", ally_support: "味方後衛", all_allies: "味方全体", enemy_front: "敵前衛", enemy_support: "敵後衛", all_enemies: "敵全体", random_enemy: "ランダムな敵" };
type Skill = { id: string; slot: number; name: string; description: string; skill_type: string; power: number; cost: number; effects: unknown };
type Card = DisplayCard & { description: string | null; card_type: string; hp: number; atk: number; shield: number; speed: number; generation_status: string; support_definition?: { effects?: unknown[] } | null };
type Effect = Record<string, unknown>;

export default function CardDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [card, setCard] = useState<Card | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch(`/api/cards/${encodeURIComponent(id)}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "カードを取得できませんでした。");
      if (live) { setCard(body.card); setSkills(body.skills ?? []); }
    }).catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : "取得できませんでした。"); });
    return () => { live = false; };
  }, [id]);
  if (error) return <main className="detail-shell"><Link className="back-link" href="/binder"><ArrowLeft size={15} />バインダーへ戻る</Link><div className="empty-state"><h1>カードを表示できません</h1><p>{error}</p><Link className="secondary-button" href="/binder">バインダーへ</Link></div></main>;
  if (!card) return <main className="detail-shell"><div className="empty-state"><span className="loading-ring" /><h2>カードを読み込んでいます</h2></div></main>;
  return <main className="detail-shell">
    <Link className="back-link" href="/binder"><ArrowLeft size={15} />バインダーへ戻る</Link>
    <section className="card-detail-hero"><div className="detail-art"><CardDisplay card={card} size="large" /></div><div className="detail-copy"><span className={`tier-label tier-label-${card.scout_tier ?? "unknown"}`}>{card.scout_tier ? `${card.scout_tier.toUpperCase()} SCOUT` : "スカウトランク未記録"}</span><span className="overline">CARD ARCHIVE / {card.card_type.toUpperCase()}</span><h1>{card.title}</h1><p>{card.description || "カードの説明はありません。"}</p>{card.card_type === "action" && <div className="detail-stats">{[["HP", card.hp], ["ATK", card.atk], ["DEF", card.shield], ["SPD", card.speed]].map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>}<Link className="secondary-button" href="/decks"><Sparkles size={15} />デッキ編成へ</Link></div></section>
    <section className="skills-section"><div className="section-title-row"><div><span className="overline">CARD SKILLS</span><h2>技と効果</h2></div><span className="count-pill">{skills.length} 技</span></div>{skills.length === 0 && card.card_type === "support" && Array.isArray(card.support_definition?.effects) ? <div className="skill-list"><article className="skill-card"><div className="skill-heading"><div><span className="skill-type">サポート効果</span><h3>使用時の効果</h3></div><span className="skill-cost">AP 0</span></div><ul className="effect-list">{formatEffects(card.support_definition.effects).map((effect, index) => <li key={`support-${index}`}>{effect}</li>)}</ul></article></div> : skills.length === 0 ? <p className="log-empty">登録されている技はありません。</p> : <div className="skill-list">{skills.map((skill) => <article className="skill-card" key={skill.id}><div className="skill-heading"><div><span className="skill-type">{skill.skill_type === "passive" ? "パッシブ" : "アクティブ"}</span><h3>{skill.name}</h3></div><span className="skill-cost">AP {skill.cost}</span></div><p>{skill.description || "技の説明はありません。"}</p><ul className="effect-list">{formatEffects(skill.effects).map((effect, index) => <li key={`${skill.id}-${index}`}>{effect}</li>)}</ul></article>)}</div>}</section>
  </main>;
}

function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function formatEffects(value: unknown) {
  const effects = Array.isArray(value) ? value.filter((effect): effect is Effect => Boolean(effect && typeof effect === "object" && !Array.isArray(effect))) : [];
  return effects.map((effect) => {
    const type = typeof effect.type === "string" ? effect.type : "";
    const label = effectLabels[type] || "効果";
    const target = typeof effect.target === "string" ? targetLabels[effect.target] : "対象";
    const amount = number(effect.value);
    if (type === "damage") return `${target}に${amount ?? ""}ダメージ`;
    if (type === "heal") return `${target}を${amount ?? ""}回復`;
    if (type === "ap_change") return `${target}のAPを${amount ?? ""}変更`;
    if (type === "shield_change") return `${target}のシールドを${amount ?? ""}変更`;
    if (type === "stat_modifier") return `${target}の${statLabels[String(effect.stat)] ?? "能力値"}を${amount ?? ""}変更`;
    if (type === "status_apply") return `${target}に${statusLabels[String(effect.key)] ?? "状態異常"}を付与`;
    if (type === "status_remove") return `${target}の状態異常を解除`;
    if (type === "counter") return `${target}から攻撃を受けたとき反撃`;
    if (type === "follow_up") return `${target}へ追撃`;
    return `${label}（${target}）`;
  });
}
