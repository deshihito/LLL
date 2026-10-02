import { BATTLE_CONFIG } from "./config.ts";
import type { BattleAction, BattleActor, BattleCard, BattleEffect, BattleEvent, BattlePlayer, BattleSkill, BattleState } from "./types.ts";

export class BattleRuleError extends Error {}

type Random = () => number;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const id = (prefix: string, sequence: number) => `${prefix}-${sequence}`;

export function createActor(card: BattleCard, instanceId: string): BattleActor {
  return { instanceId, cardId: card.cardId, title: card.title, hp: card.hp, maxHp: card.hp, atk: card.atk, def: card.shield, speed: card.speed, ap: BATTLE_CONFIG.initialAp, maxAp: BATTLE_CONFIG.maxAp, skills: card.skills, statuses: [], defeated: false };
}

export function createBattle(input: { battleId: string; firstPlayerId: string; players: Array<{ playerId: string; cards: BattleCard[]; initialFieldCardIds?: string[]; hand?: BattleCard[] }> }): BattleState {
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
  return { battleId: input.battleId, version: 1, phase: "active", turn: 1, activePlayerId: input.firstPlayerId, players, winnerPlayerId: null, destroyedByPlayer: {}, processedActionIds: [], events: [] };
}

export function calculateDamage(basePower: number, attackerAtk: number, targetDef: number, random: Random = Math.random) {
  const base = targetDef > 0 ? basePower * (attackerAtk / targetDef) + attackerAtk : basePower + attackerAtk;
  const multiplier = BATTLE_CONFIG.damageRandomMin + Math.max(0, Math.min(1, random())) * (BATTLE_CONFIG.damageRandomMax - BATTLE_CONFIG.damageRandomMin);
  return { damage: Math.max(0, Math.ceil((base * multiplier) / BATTLE_CONFIG.damageRoundUnit) * BATTLE_CONFIG.damageRoundUnit), multiplier };
}

function activePlayer(state: BattleState) { const player = state.players[state.activePlayerId]; if (!player) throw new BattleRuleError("active player is missing"); return player; }
function opponent(state: BattleState, playerId: string) { const result = Object.values(state.players).find((player) => player.playerId !== playerId); if (!result) throw new BattleRuleError("opponent is missing"); return result; }
function actorOf(player: BattlePlayer, instanceId: string) { const actor = player.actors.find((item) => item.instanceId === instanceId); if (!actor) throw new BattleRuleError("actor is not owned by player"); return actor; }
function event(state: BattleState, actionId: string, type: string, sourceActorId: string | null, targetActorIds: string[], payload: Record<string, string | number | boolean | null>): BattleEvent { const sequence = state.events.length + 1; return { eventId: id("event", sequence), actionId, turn: state.turn, sequence, type, sourceActorId, targetActorIds, payload }; }
function nextPlayerId(state: BattleState) { const ids = Object.keys(state.players); const index = ids.indexOf(state.activePlayerId); return ids[(index + 1) % ids.length]; }
function beginTurn(state: BattleState, actionId: string) {
  const player = activePlayer(state);
  for (const actor of player.actors.filter((item) => !item.defeated)) {
    actor.ap = Math.min(actor.maxAp, actor.ap + actor.speed);
    state.events.push(event(state, actionId, "ap_changed", actor.instanceId, [actor.instanceId], { amount: actor.speed, ap: actor.ap }));
  }
  for (const actor of player.actors) for (const status of actor.statuses) status.remainingTurns -= 1;
  for (const actor of player.actors) actor.statuses = actor.statuses.filter((status) => status.remainingTurns > 0);
}
function finishTurn(state: BattleState, actionId: string) { state.activePlayerId = nextPlayerId(state); state.turn += 1; state.version += 1; beginTurn(state, actionId); }
function markDefeat(state: BattleState, defeatedPlayer: BattlePlayer, actor: BattleActor, actionId: string) {
  if (actor.defeated || actor.hp > 0) return;
  actor.defeated = true;
  state.destroyedByPlayer[defeatedPlayer.playerId] = (state.destroyedByPlayer[defeatedPlayer.playerId] ?? 0) + 1;
  state.events.push(event(state, actionId, "actor_defeated", actor.instanceId, [actor.instanceId], { destroyed: state.destroyedByPlayer[defeatedPlayer.playerId] }));
  if (state.destroyedByPlayer[defeatedPlayer.playerId] >= BATTLE_CONFIG.defeatCount) { state.phase = "finished"; state.winnerPlayerId = opponent(state, defeatedPlayer.playerId).playerId; state.events.push(event(state, actionId, "battle_finished", null, [], { winnerPlayerId: state.winnerPlayerId, reason: "hp_zero" })); }
}
function targetsFor(effect: BattleEffect, selected: BattleActor[], opponentPlayer: BattlePlayer) {
  if (effect.target === "all_enemies") return opponentPlayer.actors.filter((actor) => !actor.defeated);
  return selected;
}
function applyEffect(state: BattleState, actionId: string, source: BattleActor, effect: BattleEffect, selected: BattleActor[], opponentPlayer: BattlePlayer, random: Random) {
  for (const target of targetsFor(effect, selected, opponentPlayer)) {
    if (effect.type === "damage") {
      const result = calculateDamage(effect.value ?? 0, source.atk, target.def, random); target.hp = Math.max(0, target.hp - result.damage); state.events.push(event(state, actionId, "damage_applied", source.instanceId, [target.instanceId], { damage: result.damage, randomMultiplier: result.multiplier, hp: target.hp })); markDefeat(state, opponentPlayer, target, actionId);
    } else if (effect.type === "heal") {
      const amount = Math.max(0, Math.round(effect.value ?? 0)); target.hp = Math.min(target.maxHp, target.hp + amount); state.events.push(event(state, actionId, "heal_applied", source.instanceId, [target.instanceId], { amount, hp: target.hp }));
    } else if (effect.type === "ap_change" && target.instanceId === source.instanceId) {
      const amount = Math.round(effect.value ?? 0); target.ap = Math.max(0, Math.min(target.maxAp, target.ap + amount)); state.events.push(event(state, actionId, "ap_changed", source.instanceId, [target.instanceId], { amount, ap: target.ap }));
    } else {
      state.events.push(event(state, actionId, "effect_skipped", source.instanceId, [target.instanceId], { effectType: effect.type, reason: "not_in_core_engine" }));
    }
  }
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
  if (action.type === "end_turn") { state.events.push(event(state, action.actionId, "turn_ended", null, [], {})); finishTurn(state, action.actionId); return state; }
  const source = actorOf(player, action.actorInstanceId); if (source.defeated) throw new BattleRuleError("defeated actor cannot act");
  const skill = source.skills.find((item: BattleSkill) => item.slot === action.skillSlot); if (!skill) throw new BattleRuleError("skill not found");
  if (source.ap < skill.cost) throw new BattleRuleError("not enough AP");
  const targets = action.targetInstanceIds.map((targetId) => opponent(state, player.playerId).actors.find((actor) => actor.instanceId === targetId)).filter((target): target is BattleActor => Boolean(target && !target.defeated));
  if (!targets.length) throw new BattleRuleError("target not found");
  source.ap -= skill.cost; state.events.push(event(state, action.actionId, "action_accepted", source.instanceId, targets.map((target) => target.instanceId), { skillSlot: skill.slot, ap: source.ap }));
  const enemy = opponent(state, player.playerId); for (const effect of skill.effects) applyEffect(state, action.actionId, source, effect, targets, enemy, random);
  if ((state as BattleState).phase === "finished") { state.version += 1; return state; }
  const actionsThisTurn = state.events.filter((item) => item.turn === state.turn && item.type === "action_accepted" && item.sourceActorId && player.actors.some((actor) => actor.instanceId === item.sourceActorId)).length;
  if (skill.turn_behavior !== "continue" || actionsThisTurn >= BATTLE_CONFIG.maxActionsPerTurn) finishTurn(state, action.actionId); else state.version += 1;
  return state;
}
