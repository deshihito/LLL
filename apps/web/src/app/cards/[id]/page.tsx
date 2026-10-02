"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const effectLabels: Record<string, string> = { damage: "ダメージ", heal: "回復", stat_modifier: "能力値変化", ap_change: "AP変化", shield_change: "シールド変化", status_apply: "状態異常", status_remove: "状態解除", equip_part: "パーツ装備", unequip_part: "パーツ解除", counter: "反撃", follow_up: "追撃" };
const statusLabels: Record<string, string> = { stun: "スタン", burn: "やけど", guard_break: "ガードブレイク", overdrive: "オーバードライブ" };
const statLabels: Record<string, string> = { max_hp: "最大HP", atk: "攻撃力", shield: "シールド", speed: "スピード" };
const targetLabels: Record<string, string> = { self: "自身", ally_front: "味方前衛", ally_support: "味方後衛", all_allies: "味方全体", enemy_front: "敵前衛", enemy_support: "敵後衛", all_enemies: "敵全体", random_enemy: "ランダムな敵" };
type Skill = { id: string; slot: number; name: string; description: string; skill_type: string; power: number; cost: number; effects: unknown };
type Card = { title: string; description: string | null; card_type: string; hp: number; atk: number; shield: number; speed: number; generation_status: string };
type Effect = Record<string, unknown>;

export default function CardDetailPage() {
  const [card, setCard] = useState<Card | null>(null); const [skills, setSkills] = useState<Skill[]>([]); const [error, setError] = useState("");
  useEffect(() => { const id = window.location.pathname.split("/").pop(); if (!id) return; fetch(`/api/cards/${id}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setCard(body.card); setSkills(body.skills ?? []); }).catch((caught) => setError(caught instanceof Error ? caught.message : "取得できませんでした")); }, []);
  if (error) return <main className="detail-shell"><Link href="/">← バインダーへ戻る</Link><div className="empty-panel"><h1>カードを表示できません</h1><p>{error}</p></div></main>;
  if (!card) return <main className="detail-shell"><div className="empty-panel"><span className="loading-ring" /><h2>読み込み中</h2></div></main>;
  const id = window.location.pathname.split("/").pop();
  return <main className="detail-shell"><Link href="/">← バインダーへ戻る</Link><div className="detail-card-layout"><div className="card-visual detail-card-visual"><img src={`/api/cards/${id}/image`} alt="カード画像" /><div className="card-corner stat-hp">HP {card.hp}</div><div className="card-corner stat-atk">ATK {card.atk}</div><div className="card-corner stat-def">DEF {card.shield}</div><div className="card-corner stat-spd">SPD {card.speed}</div><div className="card-visual-title">{card.title}</div></div><div className="detail-header"><span className="card-type">{cardTypeLabel(card.card_type)}</span><span className="status">{statusLabel(card.generation_status)}</span><h1>{card.title}</h1><p>{card.description || "説明はありません"}</p></div></div><div className="detail-stats">{([["HP", card.hp], ["攻撃", card.atk], ["シールド", card.shield], ["速度", card.speed]] as const).map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div><section className="skills-section"><h2>技</h2>{skills.length === 0 ? <p className="muted">登録されている技はありません。</p> : skills.map((skill) => <article className="skill-card" key={skill.id}><div className="skill-heading"><div><span className="skill-type">{skill.skill_type === "passive" ? "パッシブ" : "アクティブ"}</span><h3>{skill.name}</h3></div><span>APコスト {skill.cost}</span></div><p>{skill.description || "説明はありません"}</p><div className="skill-meta"><span>威力 {skill.power}</span><span>{skill.skill_type === "passive" ? "常時発動" : "使用可能"}</span></div><div><b>効果</b>{formatEffects(skill.effects)}</div></article>)}</section></main>;
}

function cardTypeLabel(value: string) { return ({ character: "キャラクター", item: "アイテム", equipment: "装備" } as Record<string, string>)[value] || "カード"; }
function statusLabel(value: string) { return ({ ready: "生成済み", processing: "生成中", failed: "生成失敗" } as Record<string, string>)[value] || "準備中"; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function formatEffects(value: unknown) { const effects = Array.isArray(value) ? value.filter((effect): effect is Effect => Boolean(effect && typeof effect === "object" && !Array.isArray(effect))) : []; if (!effects.length) return <p className="muted">なし</p>; return <ul className="effect-list">{effects.map((effect, index) => <li key={index}><span>{effectSummary(effect)}</span></li>)}</ul>; }
function effectSummary(effect: Effect) {
  const type = typeof effect.type === "string" ? effect.type : ""; const label = effectLabels[type] || "効果"; const target = typeof effect.target === "string" ? targetLabels[effect.target] : null; const value = number(effect.value);
  if (type === "damage") return `${target || "対象"}に${value ?? ""}ダメージ`; if (type === "heal") return `${target || "対象"}を${value ?? ""}回復`; if (type === "ap_change") return `${target || "対象"}のAPを${value ?? ""}変更`; if (type === "shield_change") return `${target || "対象"}のシールドを${value ?? ""}変更`; if (type === "stat_modifier") { const stat = typeof effect.stat === "string" ? statLabels[effect.stat] || "能力値" : "能力値"; return `${target || "対象"}の${stat}を${value ?? ""}変更`; } if (type === "status_apply") return `${target || "対象"}に${typeof effect.key === "string" ? statusLabels[effect.key] || "状態異常" : "状態異常"}を付与`; if (type === "status_remove") return `${target || "対象"}の状態異常を解除`; if (type === "counter") return `${target || "対象"}から攻撃を受けたとき${value !== null ? `${value}の` : ""}反撃`; if (type === "follow_up") return `${target || "対象"}へ${value !== null ? `${value}の` : ""}追撃`; return target ? `${label}（${target}）` : label;
}
