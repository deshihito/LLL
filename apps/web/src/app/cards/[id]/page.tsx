"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const effectLabels: Record<string, string> = { damage: "ダメージ", heal: "回復", stat_modifier: "ステータス変更", status_apply: "状態付与", status_remove: "状態解除", counter: "カウンター", follow_up: "追撃" };
type Skill = { id: string; slot: number; name: string; description: string; skill_type: string; power: number; cost: number; conditions: unknown; effects: unknown };
type Card = { title: string; description: string | null; card_type: string; hp: number; atk: number; shield: number; speed: number; generation_status: string };

export default function CardDetailPage() {
  const [card, setCard] = useState<Card | null>(null); const [skills, setSkills] = useState<Skill[]>([]); const [error, setError] = useState("");
  useEffect(() => { const id = window.location.pathname.split("/").pop(); if (!id) return; fetch(`/api/cards/${id}`).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setCard(body.card); setSkills(body.skills ?? []); }).catch((caught) => setError(caught instanceof Error ? caught.message : "取得できませんでした")); }, []);
  if (error) return <main className="detail-shell"><Link href="/">← 戻る</Link><div className="empty-panel"><h1>カードを表示できません</h1><p>{error}</p></div></main>;
  if (!card) return <main className="detail-shell"><div className="empty-panel"><span className="loading-ring" /><h2>読み込み中</h2></div></main>;
  return <main className="detail-shell"><Link href="/">← バインダーへ戻る</Link><div className="detail-header"><span className="card-type">{card.card_type.toUpperCase()}</span><span className="status">{card.generation_status}</span><h1>{card.title}</h1><p>{card.description || "説明はありません"}</p></div><div className="detail-stats">{([["HP", card.hp], ["ATK", card.atk], ["SHIELD", card.shield], ["SPEED", card.speed]] as const).map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div><section className="skills-section"><h2>技</h2>{skills.length === 0 ? <p className="muted">登録されている技はありません。</p> : skills.map((skill) => <article className="skill-card" key={skill.id}><div className="skill-heading"><div><span className="skill-type">{skill.skill_type === "passive" ? "PASSIVE" : "ACTIVE"}</span><h3>{skill.name}</h3></div><span>APコスト {skill.cost}</span></div><p>{skill.description || "説明はありません"}</p><div className="skill-meta"><span>威力 {skill.power}</span><span>条件: {formatJson(skill.conditions)}</span></div><div><b>効果</b>{formatEffects(skill.effects)}</div></article>)}</section></main>;
}

function formatJson(value: unknown) { if (value == null) return "なし"; if (typeof value === "string") return value; try { return JSON.stringify(value); } catch { return "なし"; } }
function formatEffects(value: unknown) { const effects = Array.isArray(value) ? value : []; if (!effects.length) return <p className="muted">なし</p>; return <ul className="effect-list">{effects.map((effect, index) => { const type = typeof effect === "object" && effect && "type" in effect ? String(effect.type) : ""; return <li key={index}><span>{effectLabels[type] || "未対応の効果"}</span>{type ? <small>{formatJson(effect)}</small> : null}</li>; })}</ul>; }
