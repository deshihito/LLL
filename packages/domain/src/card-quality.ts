import { validateSkill, type ConditionNode, type SkillEffect } from "./skill-schema.ts";
import { validateSupportDefinition } from "./support-schema.ts";

export type QualityIssue = { path: string; message: string };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const integer = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const implementedConditions = new Set(["always", "on_turn_start", "on_turn_end", "on_damage_taken", "on_card_destroyed", "hp_below", "hp_above", "ap_at_least", "shield_broken", "status_present", "status_absent", "turn_at_least"]);

function checkCondition(node: ConditionNode, path: string, issues: QualityIssue[]) {
  if ("all" in node || "any" in node) {
    const children = "all" in node ? node.all : node.any;
    children.forEach((child, index) => checkCondition(child, `${path}.${index}`, issues));
  } else if ("not" in node) checkCondition(node.not, `${path}.not`, issues);
  else {
    if (!implementedConditions.has(node.type)) issues.push({ path, message: "この発動条件は共有エンジンで未対応です" });
    if (node.value !== undefined && !Number.isSafeInteger(node.value)) issues.push({ path, message: "条件の数値は整数にしてください" });
  }
}
function checkEffect(effect: SkillEffect, path: string, issues: QualityIssue[]) {
  if (effect.type === "equip_part" || effect.type === "unequip_part" || effect.target === "random_enemy") issues.push({ path, message: "未対応の効果・対象です。カード操作によるパーツ装着を使用してください" });
  if ("value" in effect && !integer(effect.value, ["stat_modifier", "ap_change", "shield_change"].includes(effect.type) ? -200 : 0, effect.type === "damage" ? 150 : 200)) issues.push({ path, message: "効果の数値が安全な整数範囲を超えています" });
  if ("duration" in effect && !integer(effect.duration, 1, 5)) issues.push({ path, message: "持続期間は1〜5ターンです" });
}

/** Generation readiness is separate from model response success. Never repair unknown effects into a different card. */
export function inspectCardQuality(value: unknown): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!record(value)) return [{ path: "card", message: "カードの形式が不正です" }];
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 120) issues.push({ path: "title", message: "カード名は1〜120文字です" });
  if (typeof value.description !== "string" || value.description.length > 1000) issues.push({ path: "description", message: "説明は1000文字以内です" });
  if (!["action", "part", "support"].includes(String(value.card_type))) issues.push({ path: "card_type", message: "カード種別が不正です" });
  for (const stat of ["hp", "atk", "shield", "speed"]) {
    if (!integer(value[stat], value.card_type === "action" && stat === "hp" ? 1 : 0, value.card_type === "action" ? 200 : 0)) issues.push({ path: stat, message: "ステータスがカード種別の範囲外です" });
  }
  if (value.card_type === "support") {
    if (!Array.isArray(value.skills) || value.skills.length) issues.push({ path: "skills", message: "サポートに技は登録できません" });
    if (!validateSupportDefinition(value.support_definition)) issues.push({ path: "support_definition", message: "サポート効果・対象・条件が不正です" });
    else {
      checkCondition(value.support_definition.conditions, "support.conditions", issues);
      value.support_definition.effects.forEach((effect, index) => checkEffect(effect, `support.effects.${index}`, issues));
    }
  } else {
    if (!Array.isArray(value.skills) || value.skills.length < 1 || value.skills.length > 3) issues.push({ path: "skills", message: "技は1〜3件です" });
    else value.skills.forEach((skill, index) => {
      const path = `skills.${index}`;
      if (!validateSkill(skill)) { issues.push({ path, message: "技のコスト・効果・条件が不正です" }); return; }
      checkCondition(skill.conditions, `${path}.conditions`, issues);
      skill.effects.forEach((effect, effectIndex) => checkEffect(effect, `${path}.effects.${effectIndex}`, issues));
    });
    if (value.card_type === "part" && (typeof value.parent_card_id !== "string" || !value.parent_card_id)) issues.push({ path: "parent_card_id", message: "パーツには装着先の親カードが必要です" });
  }
  return issues;
}
