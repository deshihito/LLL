import type { BattleCard } from "./types.ts";

/** Versioned, intentionally small practice fixtures; never grant ranked rewards. */
export const STARTER_CARDS: BattleCard[] = [
  { cardId: "sample-aurora", title: "暁光の騎士", cardType: "action", hp: 150, atk: 120, shield: 40, speed: 80, skills: [{ slot: 1, name: "ルミナス・ブレード", description: "敵の前衛へ威力90の光撃。100 APを消費してターン終了。", skill_type: "active", cost: 100, conditions: { type: "always" }, effects: [{ type: "damage", target: "enemy_front", value: 90 }] }] },
  { cardId: "sample-tide", title: "星詠みの守護者", cardType: "action", hp: 160, atk: 90, shield: 70, speed: 75, skills: [{ slot: 1, name: "星の奔流", description: "敵の前衛へ威力75の攻撃。", skill_type: "active", cost: 100, conditions: { type: "always" }, effects: [{ type: "damage", target: "enemy_front", value: 75 }] }] },
  { cardId: "sample-bloom", title: "月露の祈り", cardType: "support", hp: 0, atk: 0, shield: 0, speed: 0, skills: [], supportDefinition: { version: 1, timing: "on_play", target_scope: "ally_front", cost: 0, consume_on_play: true, max_uses_per_battle: 1, conditions: { type: "always" }, effects: [{ type: "heal", target: "ally_front", value: 50 }] } },
];
export const STARTER_OPPONENT: BattleCard = { cardId: "sample-ember", title: "紅蓮の番人", cardType: "action", hp: 145, atk: 85, shield: 40, speed: 100, skills: [{ slot: 1, name: "紅蓮の一閃", description: "敵の前衛へ威力55の攻撃。", skill_type: "active", cost: 100, conditions: { type: "always" }, effects: [{ type: "damage", target: "enemy_front", value: 55 }] }] };
