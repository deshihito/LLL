"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageOff, Sparkles } from "lucide-react";

export type DisplayCard = {
  id: string;
  title: string;
  description?: string | null;
  card_type?: string | null;
  hp?: number | null;
  atk?: number | null;
  shield?: number | null;
  speed?: number | null;
  generation_status?: string | null;
  scout_tier?: "normal" | "elite" | "legend" | null;
};
export type CardSkillDisplay = { slot: number; name: string; description?: string; cost?: number; skillType?: string; disabled?: boolean };

const typeNames: Record<string, string> = { action: "アクション", support: "サポート", part: "パーツ" };
const statusNames: Record<string, string> = { ready: "生成済み", processing: "解析中", draft: "下書き", failed: "再試行できます" };
const tierNames: Record<string, string> = { normal: "NORMAL SCOUT", elite: "ELITE SCOUT", legend: "LEGEND SCOUT" };

export function CardDisplay({ card, size = "medium", showStats = true, showDescription = false, showSkills = false, skills = [], ap, maxAp, stateLabel, actionLabel, actionDisabled = false, onAction, onSkillSelect, className = "", imageSrc }: {
  card: DisplayCard;
  size?: "small" | "medium" | "large";
  showStats?: boolean;
  showDescription?: boolean;
  showSkills?: boolean;
  skills?: CardSkillDisplay[];
  ap?: number;
  maxAp?: number;
  stateLabel?: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  onSkillSelect?: (slot: number) => void;
  className?: string;
  imageSrc?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const tier = card.scout_tier ?? null;
  const cardType = card.card_type ?? "action";
  const status = card.generation_status ?? "ready";
  const showCardStats = showStats && cardType === "action";
  return (
    <article className={`card-display card-size-${size} tier-${tier ?? "unknown"} ${className}`}>
      <div className="card-art">
        {!imageFailed && card.id ? <Image
          src={imageSrc ?? `/api/cards/${encodeURIComponent(card.id)}/image`}
          alt={`${card.title}のカードアート`}
          fill
          sizes={size === "small" ? "(max-width: 720px) 44vw, 180px" : size === "large" ? "(max-width: 720px) 72vw, 340px" : "(max-width: 720px) 44vw, 280px"}
          unoptimized
          onError={() => setImageFailed(true)}
        /> : <div className="card-art-placeholder" aria-label="カード画像なし"><ImageOff size={24} /><span>NO ART</span></div>}
        <div className="card-art-shade" />
        <span className={`card-tier-mark ${tier ? `tier-mark-${tier}` : "tier-mark-unknown"}`} aria-label={tier ? tierNames[tier] : "スカウトランク未記録"}>
          {tier ? <><Sparkles size={11} />{tier === "normal" ? "N" : tier === "elite" ? "E" : "L"}</> : <span>LLL</span>}
        </span>
        <span className="card-type-mark">{typeNames[cardType] ?? "カード"}</span>
        <h3 className="card-art-title">{card.title}</h3>
        {showCardStats && <div className="card-art-stats" aria-label="カード能力値">
          <span><small>HP</small><b>{card.hp ?? "—"}</b></span>
          <span><small>ATK</small><b>{card.atk ?? "—"}</b></span>
          <span><small>DEF</small><b>{card.shield ?? "—"}</b></span>
          <span><small>SPD</small><b>{card.speed ?? "—"}</b></span>
        </div>}
      </div>
      {(status !== "ready" || showDescription || showSkills || stateLabel) && <div className="card-display-meta">
        {status !== "ready" && <span className={`card-state state-${status}`}><i aria-hidden="true" />{statusNames[status] ?? status}</span>}
        {stateLabel && <span className="card-frame-state">{stateLabel}</span>}
        {showDescription && <p>{card.description || "カードの説明はありません。"}</p>}
        {showSkills && skills.length > 0 && <div className="card-frame-skills"><div className="card-frame-skills-heading"><b>SKILLS</b>{typeof ap === "number" && <span>AP {ap} / {maxAp ?? ap}</span>}</div>{skills.map((skill) => <button type="button" key={skill.slot} className="card-frame-skill" disabled={skill.disabled || !onSkillSelect} onClick={() => onSkillSelect?.(skill.slot)}><span><b>{skill.name}</b><small>{skill.description || "効果を発動"}</small></span><strong>{skill.skillType === "passive" ? "自動" : `${skill.cost ?? 0} AP`}</strong></button>)}</div>}
        {actionLabel && <button type="button" className="card-frame-action" disabled={actionDisabled || !onAction} onClick={onAction}>{actionLabel}</button>}
      </div>}
    </article>
  );
}
