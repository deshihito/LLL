import { EFFECT_TYPES, TARGETS, validateCondition, validateEffect, type ConditionNode, type SkillEffect } from "../cards/skill-schema.ts";

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
  const type = typeof value.type === "string" ? value.type.trim().toLowerCase() : value.type;
  const next = { ...value, type } as Record<string, unknown>;
  if (typeof next.key === "string") next.key = next.key.trim().toLowerCase();
  if (typeof next.target === "string") next.target = next.target.trim().toLowerCase();
  if (typeof next.value === "string" && next.value.trim() !== "") next.value = Number(next.value);
  return next;
}
function normalizeSupportEffect(value: unknown): unknown {
  if (!record(value)) return value;
  const type = typeof value.type === "string" ? value.type.trim().toLowerCase() : value.type;
  if (typeof type !== "string" || !EFFECT_TYPES.includes(type as typeof EFFECT_TYPES[number])) return value;
  const defaultTarget = type === "ap_change" ? "self" : type === "heal" ? "ally_front" : "enemy_front";
  const target = typeof value.target === "string" ? value.target.trim().toLowerCase() : defaultTarget;
  const next = { ...value, type, target: TARGETS.includes(target as typeof TARGETS[number]) ? target : defaultTarget } as Record<string, unknown>;
  if (typeof next.value === "string" && next.value.trim() !== "") next.value = Number(next.value);
  if (typeof next.duration === "string" && next.duration.trim() !== "") next.duration = Number(next.duration);
  if (typeof next.stat === "string") next.stat = next.stat.trim().toLowerCase();
  if (typeof next.key === "string") next.key = next.key.trim().toLowerCase();
  if (typeof next.trigger === "string") next.trigger = next.trigger.trim().toLowerCase();
  if (type === "status_apply" && next.key === "stun" && next.value === undefined) next.value = 0;
  const allowed = type === "damage" || type === "heal" || type === "ap_change" || type === "shield_change"
    ? ["type", "target", "value"]
    : type === "stat_modifier" ? ["type", "target", "stat", "value", "duration"]
      : type === "status_apply" ? ["type", "target", "key", "value", "duration"]
        : type === "status_remove" ? ["type", "target", "key"]
          : type === "counter" ? ["type", "target", "trigger", "value", "duration"]
            : type === "follow_up" ? ["type", "target", "trigger", "value"] : [];
  return Object.fromEntries(allowed.map((key) => [key, next[key]]).filter(([, value]) => value !== undefined));
}
export function normalizeSupportDefinition(value: unknown): unknown {
  if (!record(value)) return value;
  const version = typeof value.version === "string" && /^\d+$/.test(value.version) ? Number(value.version) : value.version;
  const cost = typeof value.cost === "string" && /^\d+$/.test(value.cost) ? Number(value.cost) : value.cost;
  const maxUses = typeof value.max_uses_per_battle === "string" && /^\d+$/.test(value.max_uses_per_battle) ? Number(value.max_uses_per_battle) : value.max_uses_per_battle;
  const consume = typeof value.consume_on_play === "string" ? value.consume_on_play.trim().toLowerCase() === "true" : value.consume_on_play;
  const timing = typeof value.timing === "string" ? value.timing.trim().toLowerCase() : value.timing;
  const targetScope = typeof value.target_scope === "string" ? value.target_scope.trim().toLowerCase() : value.target_scope;
  const effects = Array.isArray(value.effects) ? value.effects.map(normalizeSupportEffect) : value.effects;
  return { version, timing, target_scope: targetScope, cost, consume_on_play: consume, max_uses_per_battle: maxUses, conditions: normalizeSupportCondition(value.conditions), effects };
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
