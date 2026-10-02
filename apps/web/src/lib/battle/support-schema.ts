import { validateCondition, validateEffect, type ConditionNode, type SkillEffect } from "../cards/skill-schema.ts";

export const SUPPORT_TIMINGS = ["on_play", "on_turn_start", "on_turn_end", "on_damage_taken", "on_card_destroyed"] as const;
export const SUPPORT_TARGET_SCOPES = ["self", "ally_front", "ally_support", "all_allies", "enemy_front", "enemy_support", "all_enemies"] as const;

export type SupportTiming = typeof SUPPORT_TIMINGS[number];
export type SupportTargetScope = typeof SUPPORT_TARGET_SCOPES[number];
export type SupportDefinition = {
  version: 1;
  timing: SupportTiming;
  target_scope: SupportTargetScope;
  cost: 0;
  consume_on_play: boolean;
  max_uses_per_battle: number;
  conditions: ConditionNode;
  effects: SkillEffect[];
};

/** AP is actor-local; support cards are not actors, so their current use cost is zero. */
export const SUPPORT_CONFIG = {
  defaultCost: 0,
  defaultMaxUsesPerBattle: 1,
  defaultConsumeOnPlay: true,
  maxEffectsPerCard: 6,
} as const;

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const hasNoRandomTarget = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.every(hasNoRandomTarget);
  if (!record(value)) return true;
  if (value.target === "random_enemy") return false;
  return Object.values(value).every(hasNoRandomTarget);
};
const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));

function normalizeSupportCondition(value: unknown): unknown {
  if (!record(value)) return value;
  if (Array.isArray(value.all)) return { all: value.all.map(normalizeSupportCondition) };
  if (Array.isArray(value.any)) return { any: value.any.map(normalizeSupportCondition) };
  if ("not" in value) return { not: normalizeSupportCondition(value.not) };
  return value;
}

export function normalizeSupportDefinition(value: unknown): unknown {
  if (!record(value)) return value;
  const cost = typeof value.cost === "string" && /^\d+$/.test(value.cost) ? Number(value.cost) : value.cost;
  return { ...value, cost, conditions: normalizeSupportCondition(value.conditions) };
}

export function validateSupportDefinition(value: unknown): value is SupportDefinition {
  if (!record(value) || !hasOnlyKeys(value, ["version", "timing", "target_scope", "cost", "consume_on_play", "max_uses_per_battle", "conditions", "effects"])) return false;
  if (value.version !== 1 || !SUPPORT_TIMINGS.includes(value.timing as SupportTiming) || !SUPPORT_TARGET_SCOPES.includes(value.target_scope as SupportTargetScope)) return false;
  if (value.cost !== SUPPORT_CONFIG.defaultCost || typeof value.consume_on_play !== "boolean") return false;
  if (typeof value.max_uses_per_battle !== "number" || !Number.isInteger(value.max_uses_per_battle) || value.max_uses_per_battle < 1 || value.max_uses_per_battle > 3) return false;
  if (!validateCondition(value.conditions) || !hasNoRandomTarget(value.conditions)) return false;
  if (!Array.isArray(value.effects) || value.effects.length < 1 || value.effects.length > SUPPORT_CONFIG.maxEffectsPerCard) return false;
  return value.effects.every((effect) => {
    if (!record(effect) || !validateEffect(effect) || effect.target === "random_enemy") return false;
    if (effect.type === "equip_part" || effect.type === "unequip_part") return false;
    const allowed = effect.type === "damage" || effect.type === "heal" || effect.type === "ap_change" || effect.type === "shield_change"
      ? ["type", "target", "value"]
      : effect.type === "stat_modifier" ? ["type", "target", "stat", "value", "duration"]
        : effect.type === "status_apply" ? ["type", "target", "key", "value", "duration"]
          : effect.type === "status_remove" ? ["type", "target", "key"]
            : effect.type === "counter" ? ["type", "target", "trigger", "value", "duration"]
              : effect.type === "follow_up" ? ["type", "target", "trigger", "value"] : [];
    return hasOnlyKeys(effect, allowed);
  });
}
