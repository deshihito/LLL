import { BATTLE_CONFIG } from "./config.ts";
import { validateSupportDefinition, type SupportDefinition, type SupportTargetScope } from "./support-schema.ts";
import type { BattleAction, BattleActor, BattleCard, BattleEffect, BattleEvent, BattlePlayer, BattleSkill, BattleState } from "./types.ts";

export class BattleRuleError extends Error {}

type Random = () => number;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const id = (prefix: string, sequence: number) => `${prefix}-${sequence}`;
const isBattleFinished = (state: BattleState) => state.phase === "finished";

export function createActor(card: BattleCard, instanceId: string): BattleActor {
  return { instanceId, cardId: card.cardId, title: card.title, hp: card.hp, maxHp: card.hp, atk: card.atk, def: card.shield, speed: card.speed, ap: BATTLE_CONFIG.initialAp, maxAp: BATTLE_CONFIG.maxAp, skills: card.skills, statuses: [], defeated: false };
}

export function createBattle(input: { battleId: string; firstPlayerId: string; defeatTarget?: number; players: Array<{ playerId: string; cards: BattleCard[]; initialFieldCardIds?: string[]; hand?: BattleCard[] }> }): BattleState {
  if (input.players.length !== 2) throw new BattleRuleError("1対1のバトルだけを作成できます");
  const players: Record<string, BattlePlayer> = {};
  for (const player of input.players) {
    if (!player.cards.length || player.cards.length > 5) throw new BattleRuleError("アクションカードは1〜5枚で選出してください");
    if (new Set(player.cards.map((card) => card.cardId)).size !== player.cards.length) throw new BattleRuleError("同じアクションカードは重複選出できません");
    const initialIds = player.initialFieldCardIds ?? [player.cards[0].cardId];
    if (initialIds.length < 1 || initialIds.length > BATTLE_CONFIG.maxFieldActors) throw new BattleRuleError("初期配置は1〜2枚です");
    if (initialIds.some((cardId) => !player.cards.some((card) => card.cardId === cardId))) throw new BattleRuleError("初期配置カードが選出カードに含まれていません");
    const initialCards = initialIds.map((cardId) => player.cards.find((card) => card.cardId === cardId) as BattleCard);
    const remainingCards = player.cards.filter((card) => !initialIds.includes(card.cardId));
    players[player.playerId] = { playerId: player.playerId, actors: initialCards.map((card, index) => createActor(card, `${player.playerId}-actor-${index + 1}`)), hand: player.hand ?? remainingCards, discard: [] };
  }
  if (!players[input.firstPlayerId]) throw new BattleRuleError("先攻プレイヤーが存在しません");
  const state: BattleState = { battleId: input.battleId, version: 1, phase: "active", defeatTarget: input.defeatTarget, turn: 1, activePlayerId: input.firstPlayerId, players, winnerPlayerId: null, destroyedByPlayer: {}, processedActionIds: [], events: [] };
  triggerAutomaticSupports(state, players[input.firstPlayerId], "on_turn_start", "battle-start", Math.random);
  return state;
}

export function calculateDamage(basePower: number, attackerAtk: number, targetDef: number, random: Random = Math.random) {
  const base = targetDef > 0 ? basePower * (attackerAtk / targetDef) + attackerAtk : basePower + attackerAtk;
  const multiplier = BATTLE_CONFIG.damageRandomMin + Math.max(0, Math.min(1, random())) * (BATTLE_CONFIG.damageRandomMax - BATTLE_CONFIG.damageRandomMin);
  return { damage: Math.max(0, Math.ceil((base * multiplier) / BATTLE_CONFIG.damageRoundUnit) * BATTLE_CONFIG.damageRoundUnit), multiplier };
}

function activePlayer(state: BattleState) { const player = state.players[state.activePlayerId]; if (!player) throw new BattleRuleError("active player is missing"); return player; }
function opponent(state: BattleState, playerId: string) { const result = Object.values(state.players).find((player) => player.playerId !== playerId); if (!result) throw new BattleRuleError("opponent is missing"); return result; }
function actorOf(player: BattlePlayer, instanceId: string) { const actor = player.actors.find((item) => item.instanceId === instanceId); if (!actor) throw new BattleRuleError("actor is not owned by player"); return actor; }
function modifiedStat(actor: BattleActor, stat: "max_hp" | "atk" | "shield" | "speed") { const base = stat === "max_hp" ? actor.maxHp : stat === "shield" ? actor.def : actor[stat]; return Math.max(0, base + actor.statuses.filter((status) => status.key === `modifier_${stat}`).reduce((sum, status) => sum + (status.value ?? 0), 0)); }
function event(state: BattleState, actionId: string, type: string, sourceActorId: string | null, targetActorIds: string[], payload: Record<string, string | number | boolean | null>): BattleEvent { const sequence = state.events.length + 1; return { eventId: id("event", sequence), actionId, turn: state.turn, sequence, type, sourceActorId, targetActorIds, payload }; }
function nextPlayerId(state: BattleState) { const ids = Object.keys(state.players); const index = ids.indexOf(state.activePlayerId); return ids[(index + 1) % ids.length]; }
function beginTurn(state: BattleState, actionId: string) {
  const player = activePlayer(state);
  for (const actor of player.actors.filter((item) => !item.defeated)) {
    const before = actor.ap;
    actor.ap = Math.min(actor.maxAp, actor.ap + actor.speed);
    state.events.push(event(state, actionId, "ap_changed", actor.instanceId, [actor.instanceId], { amount: actor.ap - before, ap: actor.ap }));
  }
  for (const actor of player.actors) for (const status of actor.statuses) status.remainingTurns -= 1;
  for (const actor of player.actors) actor.statuses = actor.statuses.filter((status) => status.remainingTurns > 0);
}
function finishTurn(state: BattleState, actionId: string, random: Random) {
  triggerAutomaticSupports(state, activePlayer(state), "on_turn_end", actionId, random);
  state.activePlayerId = nextPlayerId(state); state.turn += 1; state.version += 1; beginTurn(state, actionId);
  triggerAutomaticSupports(state, activePlayer(state), "on_turn_start", actionId, random);
}
function markDefeat(state: BattleState, defeatedPlayer: BattlePlayer, actor: BattleActor, actionId: string) {
  if (actor.defeated || actor.hp > 0) return;
  actor.defeated = true;
  state.destroyedByPlayer[defeatedPlayer.playerId] = (state.destroyedByPlayer[defeatedPlayer.playerId] ?? 0) + 1;
  state.events.push(event(state, actionId, "actor_defeated", actor.instanceId, [actor.instanceId], { destroyed: state.destroyedByPlayer[defeatedPlayer.playerId] }));
  if (state.destroyedByPlayer[defeatedPlayer.playerId] >= (state.defeatTarget ?? BATTLE_CONFIG.defeatCount)) { state.phase = "finished"; state.winnerPlayerId = opponent(state, defeatedPlayer.playerId).playerId; state.events.push(event(state, actionId, "battle_finished", null, [], { winnerPlayerId: state.winnerPlayerId, reason: "hp_zero" })); }
}
function resolveArmedCombatEffects(state: BattleState, actionId: string, attacker: BattleActor, target: BattleActor, attackerPlayer: BattlePlayer, targetPlayer: BattlePlayer, random: Random) {
  const counter = target.statuses.find((status) => status.key === "counter" && status.remainingTurns > 0);
  if (counter && !target.defeated && !attacker.defeated) {
    target.statuses = target.statuses.filter((status) => status !== counter);
    const result = calculateDamage(counter.value ?? 0, modifiedStat(target, "atk"), modifiedStat(attacker, "shield"), random);
    attacker.hp = Math.max(0, attacker.hp - result.damage);
    state.events.push(event(state, actionId, "counter_damage_applied", target.instanceId, [attacker.instanceId], { damage: result.damage, hp: attacker.hp }));
    triggerAutomaticSupports(state, attackerPlayer, "on_damage_taken", actionId, random);
    if (attacker.hp <= 0) { markDefeat(state, attackerPlayer, attacker, actionId); if (attacker.defeated) triggerAutomaticSupports(state, attackerPlayer, "on_card_destroyed", actionId, random); }
  }
  const followUp = attacker.statuses.find((status) => status.key === "follow_up" && status.remainingTurns > 0);
  if (followUp && !attacker.defeated && !target.defeated && state.phase === "active") {
    attacker.statuses = attacker.statuses.filter((status) => status !== followUp);
    const result = calculateDamage(followUp.value ?? 0, modifiedStat(attacker, "atk"), modifiedStat(target, "shield"), random);
    target.hp = Math.max(0, target.hp - result.damage);
    state.events.push(event(state, actionId, "follow_up_damage_applied", attacker.instanceId, [target.instanceId], { damage: result.damage, hp: target.hp }));
    triggerAutomaticSupports(state, targetPlayer, "on_damage_taken", actionId, random);
    if (target.hp <= 0) { markDefeat(state, targetPlayer, target, actionId); if (target.defeated) triggerAutomaticSupports(state, targetPlayer, "on_card_destroyed", actionId, random); }
  }
}
function targetsFor(effect: BattleEffect, selected: BattleActor[], opponentPlayer: BattlePlayer) {
  if (effect.target === "all_enemies") return opponentPlayer.actors.filter((actor) => !actor.defeated);
  return selected;
}
function applyEffect(state: BattleState, actionId: string, source: BattleActor, effect: BattleEffect, selected: BattleActor[], opponentPlayer: BattlePlayer, random: Random) {
  for (const target of targetsFor(effect, selected, opponentPlayer)) {
    if (effect.type === "damage") {
      const result = calculateDamage(effect.value ?? 0, modifiedStat(source, "atk"), modifiedStat(target, "shield"), random); target.hp = Math.max(0, target.hp - result.damage); state.events.push(event(state, actionId, "damage_applied", source.instanceId, [target.instanceId], { damage: result.damage, randomMultiplier: result.multiplier, hp: target.hp }));
      triggerAutomaticSupports(state, opponentPlayer, "on_damage_taken", actionId, random);
      const sourcePlayer = Object.values(state.players).find((player) => player.actors.some((actor) => actor.instanceId === source.instanceId));
      if (target.hp <= 0) markDefeat(state, opponentPlayer, target, actionId);
      if (target.defeated) triggerAutomaticSupports(state, opponentPlayer, "on_card_destroyed", actionId, random);
      if (sourcePlayer && !target.defeated) resolveArmedCombatEffects(state, actionId, source, target, sourcePlayer, opponentPlayer, random);
    } else if (effect.type === "heal") {
      const amount = Math.max(0, Math.round(effect.value ?? 0)); target.hp = Math.min(modifiedStat(target, "max_hp"), target.hp + amount); state.events.push(event(state, actionId, "heal_applied", source.instanceId, [target.instanceId], { amount, hp: target.hp }));
    } else if (effect.type === "ap_change" && target.instanceId === source.instanceId) {
      const amount = Math.round(effect.value ?? 0); target.ap = Math.max(0, Math.min(target.maxAp, target.ap + amount)); state.events.push(event(state, actionId, "ap_changed", source.instanceId, [target.instanceId], { amount, ap: target.ap }));
    } else if (effect.type === "shield_change") {
      const amount = Math.round(effect.value ?? 0); target.def = Math.max(0, target.def + amount); state.events.push(event(state, actionId, "shield_changed", source.instanceId, [target.instanceId], { amount, shield: target.def }));
    } else if (effect.type === "stat_modifier") {
      const stat = effect.stat ?? "atk"; const key = `modifier_${stat}`; const status = target.statuses.find((item) => item.key === key);
      if (status) { status.value = effect.value ?? 0; status.remainingTurns = Math.max(status.remainingTurns, effect.duration ?? 1); }
      else target.statuses.push({ key, stat, value: effect.value ?? 0, remainingTurns: effect.duration ?? 1, sourceActorId: source.instanceId });
      state.events.push(event(state, actionId, "stat_changed", source.instanceId, [target.instanceId], { stat, value: effect.value ?? 0 }));
    } else if (effect.type === "status_apply") {
      const status = target.statuses.find((item) => item.key === effect.key);
      if (status) { status.value = effect.value ?? 0; status.remainingTurns = Math.max(status.remainingTurns, effect.duration ?? 1); }
      else target.statuses.push({ key: effect.key ?? "unknown", value: effect.value ?? 0, remainingTurns: effect.duration ?? 1, sourceActorId: source.instanceId });
      state.events.push(event(state, actionId, "status_applied", source.instanceId, [target.instanceId], { key: effect.key ?? "unknown" }));
    } else if (effect.type === "status_remove") {
      target.statuses = target.statuses.filter((status) => status.key !== effect.key);
      state.events.push(event(state, actionId, "status_removed", source.instanceId, [target.instanceId], { key: effect.key ?? "unknown" }));
    } else if (effect.type === "counter" || effect.type === "follow_up") {
      const key = effect.type; const status = target.statuses.find((item) => item.key === key);
      if (status) { status.value = effect.value ?? 0; status.remainingTurns = Math.max(status.remainingTurns, effect.duration ?? 1); }
      else target.statuses.push({ key, trigger: effect.trigger, value: effect.value ?? 0, remainingTurns: effect.duration ?? 1, sourceActorId: source.instanceId });
      state.events.push(event(state, actionId, `${key}_armed`, source.instanceId, [target.instanceId], { value: effect.value ?? 0 }));
    } else {
      state.events.push(event(state, actionId, "effect_skipped", source.instanceId, [target.instanceId], { effectType: effect.type, reason: "not_in_core_engine" }));
    }
  }
}

function targetsForScope(scope: SupportTargetScope, owner: BattlePlayer, enemy: BattlePlayer): BattleActor[] {
  if (scope === "self" || scope === "ally_front") return owner.actors.slice(0, 1).filter((actor) => !actor.defeated);
  if (scope === "ally_support") return owner.actors.slice(1, 2).filter((actor) => !actor.defeated);
  if (scope === "all_allies") return owner.actors.filter((actor) => !actor.defeated);
  if (scope === "enemy_front") return enemy.actors.slice(0, 1).filter((actor) => !actor.defeated);
  if (scope === "enemy_support") return enemy.actors.slice(1, 2).filter((actor) => !actor.defeated);
  return enemy.actors.filter((actor) => !actor.defeated);
}
function targetsForSupportEffect(target: string | undefined, owner: BattlePlayer, enemy: BattlePlayer, selected: BattleActor[]): Array<{ actor: BattleActor; player: BattlePlayer }> {
  if (target === "all_allies") return owner.actors.filter((actor) => !actor.defeated).map((actor) => ({ actor, player: owner }));
  if (target === "all_enemies") return enemy.actors.filter((actor) => !actor.defeated).map((actor) => ({ actor, player: enemy }));
  const candidates = target === "self" || target === "ally_front" ? owner.actors.slice(0, 1)
    : target === "ally_support" ? owner.actors.slice(1, 2)
      : target === "enemy_front" ? enemy.actors.slice(0, 1)
        : target === "enemy_support" ? enemy.actors.slice(1, 2) : [];
  const candidate = candidates.find((actor) => !actor.defeated && (selected.includes(actor) || target === "self"));
  if (candidate) return [{ actor: candidate, player: owner.actors.includes(candidate) ? owner : enemy }];
  return selected.filter((actor) => !actor.defeated).map((actor) => ({ actor, player: owner.actors.includes(actor) ? owner : enemy }));
}
function conditionMatches(node: unknown, state: BattleState, owner: BattlePlayer, selected: BattleActor[], trigger?: string): boolean {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const condition = node as Record<string, unknown>;
  if (Array.isArray(condition.all)) return condition.all.every((child) => conditionMatches(child, state, owner, selected, trigger));
  if (Array.isArray(condition.any)) return condition.any.some((child) => conditionMatches(child, state, owner, selected, trigger));
  if ("not" in condition) return !conditionMatches(condition.not, state, owner, selected, trigger);
  const actor = selected[0] ?? owner.actors.find((item) => !item.defeated);
  switch (condition.type) {
    case "always": return true;
    case "turn_at_least": return state.turn >= Number(condition.value);
    case "hp_below": return Boolean(actor && actor.hp / Math.max(1, actor.maxHp) * 100 < Number(condition.value));
    case "hp_above": return Boolean(actor && actor.hp / Math.max(1, actor.maxHp) * 100 > Number(condition.value));
    case "ap_at_least": return Boolean(actor && actor.ap >= Number(condition.value));
    case "shield_broken": return Boolean(actor && actor.def <= 0);
    case "status_present": return Boolean(actor?.statuses.some((status) => status.key === condition.key));
    case "status_absent": return Boolean(actor && !actor.statuses.some((status) => status.key === condition.key));
    case "on_turn_start": case "on_turn_end": case "on_damage_taken": case "on_card_destroyed": return trigger === condition.type;
    default: return false;
  }
}
function applySupportEffect(state: BattleState, actionId: string, effect: BattleEffect, owner: BattlePlayer, enemy: BattlePlayer, selected: BattleActor[], random: Random, supportInstanceId: string, index: number) {
  const targets = targetsForSupportEffect(effect.target, owner, enemy, selected);
  for (const { actor, player } of targets) {
    if (effect.type === "damage") {
      const source = owner.actors.find((item) => !item.defeated) ?? owner.actors[0];
      const result = calculateDamage(effect.value ?? 0, source ? modifiedStat(source, "atk") : 0, modifiedStat(actor, "shield"), random);
      actor.hp = Math.max(0, actor.hp - result.damage);
      state.events.push(event(state, actionId, "damage_applied", null, [actor.instanceId], { damage: result.damage, randomMultiplier: result.multiplier, hp: actor.hp, supportInstanceId }));
      triggerAutomaticSupports(state, player, "on_damage_taken", actionId, random);
      if (actor.hp <= 0) markDefeat(state, player, actor, actionId);
      if (actor.defeated) triggerAutomaticSupports(state, player, "on_card_destroyed", actionId, random);
    } else if (effect.type === "heal") {
      const amount = Math.max(0, Math.round(effect.value ?? 0)); actor.hp = Math.max(0, Math.min(modifiedStat(actor, "max_hp"), actor.hp + amount));
      state.events.push(event(state, actionId, "heal_applied", null, [actor.instanceId], { amount, hp: actor.hp, supportInstanceId }));
    } else if (effect.type === "ap_change") {
      const amount = Math.round(effect.value ?? 0); actor.ap = Math.max(0, Math.min(actor.maxAp, actor.ap + amount));
      state.events.push(event(state, actionId, "ap_changed", null, [actor.instanceId], { amount, ap: actor.ap, supportInstanceId }));
    } else if (effect.type === "shield_change") {
      const amount = Math.round(effect.value ?? 0); actor.def = Math.max(0, actor.def + amount);
      state.events.push(event(state, actionId, "shield_changed", null, [actor.instanceId], { amount, shield: actor.def, supportInstanceId }));
    } else if (effect.type === "stat_modifier") {
      const stat = effect.stat ?? "atk"; const key = `modifier_${stat}`; const status = actor.statuses.find((item) => item.key === key);
      if (status) { status.value = effect.value ?? 0; status.remainingTurns = Math.max(status.remainingTurns, effect.duration ?? 1); }
      else actor.statuses.push({ key, stat, value: effect.value ?? 0, remainingTurns: effect.duration ?? 1, sourceActorId: supportInstanceId });
      state.events.push(event(state, actionId, "stat_changed", null, [actor.instanceId], { stat, value: effect.value ?? 0, supportInstanceId }));
    } else if (effect.type === "status_apply") {
      const status = actor.statuses.find((item) => item.key === effect.key);
      if (status) { status.value = effect.value ?? 0; status.remainingTurns = Math.max(status.remainingTurns, effect.duration ?? 1); }
      else actor.statuses.push({ key: effect.key ?? "unknown", value: effect.value ?? 0, remainingTurns: effect.duration ?? 1, sourceActorId: supportInstanceId });
      state.events.push(event(state, actionId, "status_applied", null, [actor.instanceId], { key: effect.key ?? "unknown", supportInstanceId }));
    } else if (effect.type === "status_remove") {
      actor.statuses = actor.statuses.filter((status) => status.key !== effect.key);
      state.events.push(event(state, actionId, "status_removed", null, [actor.instanceId], { key: effect.key ?? "unknown", supportInstanceId }));
    } else if (effect.type === "counter" || effect.type === "follow_up") {
      const key = effect.type; const status = actor.statuses.find((item) => item.key === key);
      if (status) { status.value = effect.value ?? 0; status.remainingTurns = Math.max(status.remainingTurns, effect.duration ?? 1); }
      else actor.statuses.push({ key, trigger: effect.trigger, value: effect.value ?? 0, remainingTurns: effect.duration ?? 1, sourceActorId: supportInstanceId });
      state.events.push(event(state, actionId, `${key}_armed`, null, [actor.instanceId], { value: effect.value ?? 0, supportInstanceId }));
    } else {
      state.events.push(event(state, actionId, "effect_skipped", null, [actor.instanceId], { effectType: effect.type, reason: "not_in_core_engine", supportInstanceId }));
    }
  }
  state.events.push(event(state, actionId, "support_effect_applied", null, targets.map(({ actor }) => actor.instanceId), { effectIndex: index + 1, effectType: effect.type, supportInstanceId }));
}
function triggerAutomaticSupports(state: BattleState, owner: BattlePlayer | undefined, timing: string, actionId: string, random: Random) {
  if (!owner) return;
  const enemy = opponent(state, owner.playerId);
  for (const card of [...owner.hand]) {
    const definition = card.supportDefinition;
    if (card.cardType !== "support" || !definition || !validateSupportDefinition(definition) || definition.timing !== timing) continue;
    const uses = card.supportUses ?? 0;
    if (uses >= definition.max_uses_per_battle) continue;
    const selected = targetsForScope(definition.target_scope, owner, enemy);
    if (!selected.length || !conditionMatches(definition.conditions, state, owner, selected, timing)) continue;
    const instanceId = card.instanceId ?? card.cardId;
    state.events.push(event(state, actionId, "support_triggered", null, selected.map((actor) => actor.instanceId), { supportInstanceId: instanceId, timing }));
    const handIndex = owner.hand.findIndex((item) => item.instanceId === card.instanceId || item.cardId === card.cardId);
    if (definition.consume_on_play && handIndex >= 0) {
      const [used] = owner.hand.splice(handIndex, 1);
      owner.discard.push({ ...used, supportUses: uses + 1 });
    } else if (handIndex >= 0) owner.hand[handIndex] = { ...owner.hand[handIndex], supportUses: uses + 1 };
    definition.effects.forEach((effect, index) => applySupportEffect(state, actionId, effect, owner, enemy, selected, random, instanceId, index));
    if (definition.consume_on_play && handIndex >= 0) state.events.push(event(state, actionId, "support_discarded", null, selected.map((actor) => actor.instanceId), { supportInstanceId: instanceId }));
  }
}
function applySupport(state: BattleState, action: Extract<BattleAction, { type: "use_support" }>, owner: BattlePlayer, random: Random) {
  const cardIndex = owner.hand.findIndex((card) => card.cardType === "support" && (card.instanceId === action.supportInstanceId || card.cardId === action.supportInstanceId));
  if (cardIndex < 0) throw new BattleRuleError("support card is not in hand");
  const card = owner.hand[cardIndex];
  const definition: SupportDefinition | null = card.supportDefinition ?? null;
  if (!definition || !validateSupportDefinition(definition)) throw new BattleRuleError("support definition is invalid");
  if (definition.timing !== "on_play") throw new BattleRuleError("support timing is not playable");
  const uses = card.supportUses ?? 0;
  if (uses >= definition.max_uses_per_battle) throw new BattleRuleError("support use limit reached");
  const enemy = opponent(state, owner.playerId);
  const allowed = targetsForScope(definition.target_scope, owner, enemy);
  const targetIds = [...new Set(action.targetInstanceIds)];
  const selected = targetIds.map((targetId) => allowed.find((actor) => actor.instanceId === targetId)).filter((actor): actor is BattleActor => Boolean(actor));
  if (!selected.length || selected.length !== targetIds.length) throw new BattleRuleError("support target is invalid");
  if (!conditionMatches(definition.conditions, state, owner, selected)) throw new BattleRuleError("support conditions are not met");

  state.events.push(event(state, action.actionId, "support_play_accepted", null, selected.map((actor) => actor.instanceId), { supportInstanceId: card.instanceId ?? card.cardId, apCost: 0 }));
  definition.effects.forEach((effect, index) => applySupportEffect(state, action.actionId, effect, owner, enemy, selected, random, card.instanceId ?? card.cardId, index));
  if (definition.consume_on_play) {
    const [used] = owner.hand.splice(cardIndex, 1); owner.discard.push({ ...used, supportUses: uses + 1 });
    state.events.push(event(state, action.actionId, "support_discarded", null, selected.map((actor) => actor.instanceId), { supportInstanceId: card.instanceId ?? card.cardId }));
  } else {
    owner.hand[cardIndex] = { ...card, supportUses: uses + 1 };
  }
  state.version += 1;
}

export function applyAction(input: BattleState, action: BattleAction, options: { random?: Random } = {}): BattleState {
  const state = clone(input); const random = options.random ?? Math.random;
  if (state.phase !== "active") throw new BattleRuleError("battle is not active");
  if (action.battleId !== state.battleId) throw new BattleRuleError("battleId mismatch");
  if (action.expectedVersion !== state.version) throw new BattleRuleError("stale battle version");
  if (state.processedActionIds.includes(action.actionId)) throw new BattleRuleError("action already processed");
  if (action.playerId !== state.activePlayerId) throw new BattleRuleError("not active player");
  const player = activePlayer(state);
  state.processedActionIds.push(action.actionId);
  if (action.type === "end_turn") { state.events.push(event(state, action.actionId, "turn_ended", null, [], {})); finishTurn(state, action.actionId, random); return state; }
  if (action.type === "use_support") { applySupport(state, action, player, random); return state; }
  const source = actorOf(player, action.actorInstanceId); if (source.defeated) throw new BattleRuleError("defeated actor cannot act");
  const skill = source.skills.find((item: BattleSkill) => item.slot === action.skillSlot); if (!skill) throw new BattleRuleError("skill not found");
  const cost = skill.skill_type === "passive" ? 0 : 100;
  if (source.ap < cost) throw new BattleRuleError("not enough AP");
  const targets = action.targetInstanceIds.map((targetId) => opponent(state, player.playerId).actors.find((actor) => actor.instanceId === targetId)).filter((target): target is BattleActor => Boolean(target && !target.defeated));
  if (!targets.length) throw new BattleRuleError("target not found");
  source.ap -= cost; state.events.push(event(state, action.actionId, "action_accepted", source.instanceId, targets.map((target) => target.instanceId), { skillSlot: skill.slot, apCost: cost, ap: source.ap }));
  const enemy = opponent(state, player.playerId); for (const effect of skill.effects) applyEffect(state, action.actionId, source, effect, targets, enemy, random);
  if (isBattleFinished(state)) { state.version += 1; return state; }
  const actionsThisTurn = state.events.filter((item) => item.turn === state.turn && item.type === "action_accepted" && item.sourceActorId && player.actors.some((actor) => actor.instanceId === item.sourceActorId)).length;
  if (skill.turn_behavior !== "continue" || actionsThisTurn >= BATTLE_CONFIG.maxActionsPerTurn) finishTurn(state, action.actionId, random); else state.version += 1;
  return state;
}
