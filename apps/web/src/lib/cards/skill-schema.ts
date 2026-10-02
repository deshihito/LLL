export const TARGETS = ["self", "ally_front", "ally_support", "all_allies", "enemy_front", "enemy_support", "all_enemies", "random_enemy"] as const;
export const CONDITION_TYPES = ["always", "on_turn_start", "on_turn_end", "on_attack", "on_hit", "on_damage_taken", "on_card_destroyed", "hp_below", "hp_above", "ap_at_least", "shield_broken", "part_equipped", "status_present", "status_absent", "turn_at_least"] as const;
export const EFFECT_TYPES = ["damage", "heal", "stat_modifier", "ap_change", "shield_change", "status_apply", "status_remove", "equip_part", "unequip_part", "counter", "follow_up"] as const;
export const STAT_KEYS = ["max_hp", "atk", "shield", "speed"] as const;
export const STATUS_KEYS = ["stun", "burn", "guard_break", "overdrive"] as const;
export const EVENT_TRIGGERS = ["on_turn_start", "on_turn_end", "on_attack", "on_hit", "on_damage_taken", "on_card_destroyed"] as const;

export type Target = typeof TARGETS[number];
export type ConditionType = typeof CONDITION_TYPES[number];
export type EffectType = typeof EFFECT_TYPES[number];
export type JsonValue = string | number | boolean | null | { [key: string]: JsonValue | undefined } | JsonValue[];
export type ConditionLeaf = { type: ConditionType; target?: Target; value?: number; key?: string };
export type ConditionNode = ConditionLeaf | { all: ConditionNode[] } | { any: ConditionNode[] } | { not: ConditionNode };
export type SkillEffect =
  | { type: "damage" | "heal"; target: Target; value: number }
  | { type: "stat_modifier"; target: Target; stat: typeof STAT_KEYS[number]; value: number; duration: number }
  | { type: "ap_change"; target: "self"; value: number }
  | { type: "shield_change"; target: Target; value: number }
  | { type: "status_apply"; target: Target; key: typeof STATUS_KEYS[number]; value: number; duration: number }
  | { type: "status_remove"; target: Target; key: typeof STATUS_KEYS[number] }
  | { type: "equip_part" | "unequip_part"; target: Target; key: string }
  | { type: "counter"; trigger: "on_damage_taken"; target: Target; value: number; duration: number }
  | { type: "follow_up"; trigger: "on_hit"; target: Target; value: number };
export type GeneratedSkill = { name: string; description: string; skill_type: "active" | "passive"; cost: 0 | 100; turn_behavior?: "end" | "continue"; conditions: ConditionNode; effects: SkillEffect[] };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isOneOf = <T extends readonly string[]>(value: unknown, values: T): value is T[number] => typeof value === "string" && values.includes(value);
const boundedNumber = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function validateCondition(node: unknown, depth = 0, state = { nodes: 0 }): node is ConditionNode {
  if (depth > 3 || state.nodes++ > 12 || !isRecord(node)) return false;
  if ("all" in node || "any" in node) {
    const key = "all" in node ? "all" : "any";
    return Array.isArray(node[key]) && node[key].length > 0 && node[key].every((child) => validateCondition(child, depth + 1, state));
  }
  if ("not" in node) return validateCondition(node.not, depth + 1, state);
  if (!isOneOf(node.type, CONDITION_TYPES)) return false;
  if (node.target !== undefined && !isOneOf(node.target, TARGETS)) return false;
  if (node.value !== undefined && !boundedNumber(node.value, -100000, 100000)) return false;
  if (["part_equipped", "status_present", "status_absent"].includes(node.type as string) && (typeof node.key !== "string" || node.key.length === 0 || node.key.length > 80)) return false;
  if (["hp_below", "hp_above"].includes(node.type as string) && !boundedNumber(node.value, 0, 100)) return false;
  if (["ap_at_least", "turn_at_least"].includes(node.type as string) && !boundedNumber(node.value, 0, 1000)) return false;
  return true;
}

export function validateEffect(effect: unknown): effect is SkillEffect {
  if (!isRecord(effect) || !isOneOf(effect.type, EFFECT_TYPES) || !isOneOf(effect.target, TARGETS)) return false;
  if (["damage", "heal", "ap_change", "shield_change"].includes(effect.type as string) && !boundedNumber(effect.value, -100000, 100000)) return false;
  if (effect.type === "ap_change" && effect.target !== "self") return false;
  if (effect.type === "stat_modifier") return isOneOf(effect.stat, STAT_KEYS) && boundedNumber(effect.value, -100000, 100000) && boundedNumber(effect.duration, 1, 5);
  if (effect.type === "status_apply") return isOneOf(effect.key, STATUS_KEYS) && boundedNumber(effect.value, 10, 200) && boundedNumber(effect.duration, 1, 5);
  if (effect.type === "status_remove") return isOneOf(effect.key, STATUS_KEYS);
  if (["equip_part", "unequip_part"].includes(effect.type as string)) return typeof effect.key === "string" && effect.key.length > 0 && effect.key.length <= 80;
  if (effect.type === "counter") return effect.trigger === "on_damage_taken" && boundedNumber(effect.value, 0, 100000) && boundedNumber(effect.duration, 1, 5);
  if (effect.type === "follow_up") return effect.trigger === "on_hit" && boundedNumber(effect.value, 0, 100000);
  return true;
}

function containsEvent(node: ConditionNode): boolean {
  if ("all" in node) return node.all.some(containsEvent);
  if ("any" in node) return node.any.some(containsEvent);
  if ("not" in node) return containsEvent(node.not);
  return EVENT_TRIGGERS.includes(node.type as typeof EVENT_TRIGGERS[number]);
}

export function validateSkill(value: unknown): value is GeneratedSkill {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.length < 1 || value.name.length > 80 || typeof value.description !== "string" || value.description.length > 500) return false;
  if (value.skill_type !== "active" && value.skill_type !== "passive") return false;
  if (value.turn_behavior !== undefined && value.turn_behavior !== "end" && value.turn_behavior !== "continue") return false;
  if (value.cost !== (value.skill_type === "active" ? 100 : 0)) return false;
  if (!validateCondition(value.conditions)) return false;
  if (value.skill_type === "passive" && !containsEvent(value.conditions as ConditionNode)) return false;
  return Array.isArray(value.effects) && value.effects.length >= 1 && value.effects.length <= 6 && value.effects.every(validateEffect);
}

export function normalizeSkill(value: GeneratedSkill): GeneratedSkill {
  return { ...value, cost: value.skill_type === "active" ? 100 : 0, name: value.name.trim(), description: value.description.trim(), turn_behavior: value.turn_behavior ?? "end", effects: value.effects.map((effect) => {
    if ("value" in effect && typeof effect.value === "number") return { ...effect, value: Math.max(-100000, Math.min(100000, Math.round(effect.value))) } as SkillEffect;
    return effect;
  }) };
}
