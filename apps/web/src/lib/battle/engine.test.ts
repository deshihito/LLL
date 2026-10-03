import assert from "node:assert/strict";
import { applyAction, calculateDamage, createBattle } from "./engine.ts";
import type { BattleCard } from "./types.ts";

const attackCard = (cardId: string, speed = 20, skillType: "active" | "passive" = "active"): BattleCard => ({
  cardId, title: cardId, hp: 100, atk: 100, shield: 50, speed,
  skills: [{ slot: 1, name: "攻撃", skill_type: skillType, cost: skillType === "active" ? 50 : 0, turn_behavior: "end", effects: [{ type: "damage", target: "enemy_front", value: 50 }] }],
});

const first = attackCard("a");
const second = attackCard("b");
const initial = createBattle({ battleId: "battle-1", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [first] }, { playerId: "p2", cards: [second] }] });
assert.equal(initial.players.p1.actors[0].ap, 100, "each action actor begins at 100 AP");
assert.equal(initial.players.p2.actors[0].ap, 100, "AP is not shared between players");
assert.equal(calculateDamage(50, 100, 50, () => 0.5).damage, 33);
assert.equal(calculateDamage(150, 100, 100, () => 0).damage, 60, "power uses atk/(atk+def) with the -20% random bound");
assert.equal(calculateDamage(150, 100, 100, () => 1).damage, 90, "power uses atk/(atk+def) with the +20% random bound");
const afterAttack = applyAction(initial, { actionId: "action-1", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "use_skill", actorInstanceId: "p1-actor-1", skillSlot: 1, targetInstanceIds: ["p2-actor-1"] }, { random: () => 0.5 });
assert.equal(afterAttack.players.p2.actors[0].hp, 67);
assert.equal(afterAttack.players.p2.actors[0].defeated, false);
assert.equal(afterAttack.players.p1.actors[0].ap, 0, "active skills spend exactly 100 even when a legacy snapshot says 50");
assert.equal(afterAttack.players.p2.actors[0].ap, 120, "the next actor regenerates AP at turn start");
assert.equal(afterAttack.activePlayerId, "p2");
const afterEnd = applyAction(initial, { actionId: "end-1", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "end_turn" });
assert.equal(afterEnd.players.p2.actors[0].ap, 120, "the next actor gains its own SPD at turn start");
const capped = structuredClone(initial);
capped.players.p2.actors[0].ap = 990;
assert.equal(applyAction(capped, { actionId: "end-cap", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "end_turn" }).players.p2.actors[0].ap, 1000);
const shortAp = structuredClone(initial);
shortAp.players.p1.actors[0].ap = 99;
assert.throws(() => applyAction(shortAp, { actionId: "short", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "use_skill", actorInstanceId: "p1-actor-1", skillSlot: 1, targetInstanceIds: ["p2-actor-1"] }), /not enough AP/);
const passiveState = structuredClone(initial);
passiveState.players.p1.actors[0].skills[0].skill_type = "passive";
passiveState.players.p1.actors[0].ap = 0;
assert.equal(applyAction(passiveState, { actionId: "passive", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "use_skill", actorInstanceId: "p1-actor-1", skillSlot: 1, targetInstanceIds: ["p2-actor-1"] }, { random: () => 0.5 }).players.p1.actors[0].ap, 0, "passive costs zero AP");

const supportDefinition = { version: 1 as const, timing: "on_play" as const, target_scope: "ally_front" as const, cost: 0 as const, consume_on_play: true, max_uses_per_battle: 1, conditions: { all: [{ type: "always" as const }] }, effects: [{ type: "heal" as const, target: "ally_front" as const, value: 10 }, { type: "heal" as const, target: "ally_front" as const, value: 60 }] };
const supportCard: BattleCard = { cardId: "support-card", instanceId: "p1-support-1", cardType: "support", title: "手当て", hp: 0, atk: 0, shield: 0, speed: 0, skills: [], supportDefinition };
const supportState = createBattle({ battleId: "battle-1", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [first], hand: [supportCard] }, { playerId: "p2", cards: [second] }] });
supportState.players.p1.actors[0].hp = 30;
supportState.players.p1.actors[0].ap = 0;
assert.equal(supportState.players.p1.actors.length, 1, "support cards do not become field actors");
assert.equal(supportState.players.p1.hand.length, 1, "support starts in hand rather than the field");
const afterSupport = applyAction(supportState, { actionId: "support-1", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "use_support", supportInstanceId: "p1-support-1", targetInstanceIds: ["p1-actor-1"] });
assert.equal(afterSupport.players.p1.actors[0].hp, 100);
assert.equal(afterSupport.players.p1.actors[0].ap, 0, "support plays are free and do not modify actor AP");
assert.equal(afterSupport.players.p1.actors.length, 1, "support play never adds or removes an actor");
assert.deepEqual(afterSupport.events.filter((item) => item.type === "heal_applied").map((item) => item.payload.amount), [10, 60], "support effects resolve in definition order");
assert.equal(afterSupport.players.p1.hand.length, 0);
assert.equal(afterSupport.players.p1.discard[0].supportUses, 1);
assert.deepEqual(afterSupport.events.filter((item) => item.type.startsWith("support_")).map((item) => item.type), ["support_play_accepted", "support_effect_applied", "support_effect_applied", "support_discarded"]);
const utilityDefinition = { ...supportDefinition, consume_on_play: false, effects: [
  { type: "shield_change" as const, target: "ally_front" as const, value: 20 },
  { type: "stat_modifier" as const, target: "ally_front" as const, stat: "atk" as const, value: 5, duration: 2 },
  { type: "status_apply" as const, target: "ally_front" as const, key: "guard_break" as const, value: 20, duration: 1 },
  { type: "counter" as const, target: "ally_front" as const, trigger: "on_damage_taken" as const, value: 10, duration: 1 },
  { type: "follow_up" as const, target: "ally_front" as const, trigger: "on_hit" as const, value: 5 },
] };
const utilityState = createBattle({ battleId: "battle-1", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [first], hand: [{ ...supportCard, supportDefinition: utilityDefinition }] }, { playerId: "p2", cards: [second] }] });
const afterUtility = applyAction(utilityState, { actionId: "support-utility", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "use_support", supportInstanceId: "p1-support-1", targetInstanceIds: ["p1-actor-1"] });
assert.equal(afterUtility.players.p1.actors[0].def, 70, "support shield effects apply to the selected actor");
assert.deepEqual(afterUtility.players.p1.actors[0].statuses.map((status) => status.key), ["modifier_atk", "guard_break", "counter", "follow_up"], "support modifiers and triggered effects are recorded as statuses");
assert.equal(afterUtility.events.some((item) => item.type === "effect_skipped"), false, "validated support effects are not silently skipped");
const unmetConditionState = structuredClone(supportState);
unmetConditionState.players.p1.hand[0].supportDefinition = { ...supportDefinition, conditions: { all: [{ type: "hp_below", value: 20 }] } };
assert.throws(() => applyAction(unmetConditionState, { actionId: "support-condition", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "use_support", supportInstanceId: "p1-support-1", targetInstanceIds: ["p1-actor-1"] }), /conditions are not met/);
assert.equal(unmetConditionState.players.p1.hand.length, 1, "failed conditions leave support in hand");
assert.throws(() => applyAction(supportState, { actionId: "support-bad-target", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "use_support", supportInstanceId: "p1-support-1", targetInstanceIds: ["p2-actor-1"] }), /target is invalid/);
const limitedSupport = { ...supportCard, supportDefinition: { ...supportDefinition, consume_on_play: false } };
const limitedState = createBattle({ battleId: "battle-1", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [first], hand: [limitedSupport] }, { playerId: "p2", cards: [second] }] });
applyAction(limitedState, { actionId: "support-use-once", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "use_support", supportInstanceId: "p1-support-1", targetInstanceIds: ["p1-actor-1"] });
assert.throws(() => applyAction({ ...limitedState, version: 2, players: { ...limitedState.players, p1: { ...limitedState.players.p1, hand: [{ ...limitedSupport, supportUses: 1 }] } } }, { actionId: "support-use-twice", battleId: "battle-1", expectedVersion: 2, playerId: "p1", type: "use_support", supportInstanceId: "p1-support-1", targetInstanceIds: ["p1-actor-1"] }), /use limit reached/);
const weakCard = (cardId: string): BattleCard => ({ cardId, title: cardId, hp: 500, atk: 10, shield: 1000, speed: 1, skills: [{ slot: 1, name: "小技", skill_type: "active", cost: 100, turn_behavior: "end", effects: [{ type: "damage", target: "enemy_front", value: 1 }] }] });
const autoSupport: BattleCard = { ...supportCard, cardId: "auto-support", instanceId: "p1-auto-support", supportDefinition: { ...supportDefinition, timing: "on_turn_start", target_scope: "ally_front", consume_on_play: false, conditions: { type: "on_turn_start" }, effects: [{ type: "stat_modifier", target: "ally_front", stat: "atk", value: 7, duration: 2 }] } };
const automaticState = createBattle({ battleId: "battle-auto", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [weakCard("auto-actor")], hand: [autoSupport] }, { playerId: "p2", cards: [weakCard("auto-enemy")] }] });
assert.equal(automaticState.players.p1.actors[0].statuses[0]?.key, "modifier_atk", "turn-start support fires when the battle begins");
assert.equal(automaticState.players.p1.hand[0].supportUses, 1, "automatic support increments its bounded per-match use count");
const counterSupport: BattleCard = { ...supportCard, cardId: "counter-support", instanceId: "p1-counter-support", supportDefinition: { ...utilityDefinition, effects: [{ type: "counter", target: "ally_front", trigger: "on_damage_taken", value: 10, duration: 2 }] } };
let counterState = createBattle({ battleId: "battle-counter", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [weakCard("counter-actor")], hand: [counterSupport] }, { playerId: "p2", cards: [weakCard("counter-enemy")] }] });
counterState = applyAction(counterState, { actionId: "counter-arm", battleId: "battle-counter", expectedVersion: 1, playerId: "p1", type: "use_support", supportInstanceId: "p1-counter-support", targetInstanceIds: ["p1-actor-1"] });
counterState = applyAction(counterState, { actionId: "counter-p1-hit", battleId: "battle-counter", expectedVersion: 2, playerId: "p1", type: "use_skill", actorInstanceId: "p1-actor-1", skillSlot: 1, targetInstanceIds: ["p2-actor-1"] }, { random: () => 0.5 });
counterState = applyAction(counterState, { actionId: "counter-p2-hit", battleId: "battle-counter", expectedVersion: 3, playerId: "p2", type: "use_skill", actorInstanceId: "p2-actor-1", skillSlot: 1, targetInstanceIds: ["p1-actor-1"] }, { random: () => 0.5 });
assert.equal(counterState.events.some((item) => item.type === "counter_damage_applied"), true, "a counter armed by support resolves after the actor is hit");
const followSupport: BattleCard = { ...supportCard, cardId: "follow-support", instanceId: "p1-follow-support", supportDefinition: { ...utilityDefinition, effects: [{ type: "follow_up", target: "ally_front", trigger: "on_hit", value: 10 }] } };
let followState = createBattle({ battleId: "battle-follow", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [weakCard("follow-actor")], hand: [followSupport] }, { playerId: "p2", cards: [weakCard("follow-enemy")] }] });
followState = applyAction(followState, { actionId: "follow-arm", battleId: "battle-follow", expectedVersion: 1, playerId: "p1", type: "use_support", supportInstanceId: "p1-follow-support", targetInstanceIds: ["p1-actor-1"] });
followState = applyAction(followState, { actionId: "follow-hit", battleId: "battle-follow", expectedVersion: 2, playerId: "p1", type: "use_skill", actorInstanceId: "p1-actor-1", skillSlot: 1, targetInstanceIds: ["p2-actor-1"] }, { random: () => 0.5 });
assert.equal(followState.events.some((item) => item.type === "follow_up_damage_applied"), true, "a follow-up armed by support resolves after a successful hit");
const reactiveSupport: BattleCard = { ...supportCard, cardId: "reactive-support", instanceId: "p2-reactive-support", supportDefinition: { ...supportDefinition, timing: "on_damage_taken", target_scope: "ally_front", consume_on_play: false, conditions: { type: "on_damage_taken" }, effects: [{ type: "shield_change", target: "ally_front", value: 5 }] } };
const damagingSupport: BattleCard = { ...supportCard, cardId: "damaging-support", instanceId: "p1-damaging-support", supportDefinition: { ...supportDefinition, target_scope: "enemy_front", effects: [{ type: "damage", target: "enemy_front", value: 1 }] } };
const supportDamageState = createBattle({ battleId: "battle-support-damage", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [weakCard("damage-actor")], hand: [damagingSupport] }, { playerId: "p2", cards: [weakCard("damage-target")], hand: [reactiveSupport] }] });
const afterSupportDamage = applyAction(supportDamageState, { actionId: "support-damage", battleId: "battle-support-damage", expectedVersion: 1, playerId: "p1", type: "use_support", supportInstanceId: "p1-damaging-support", targetInstanceIds: ["p2-actor-1"] }, { random: () => 0.5 });
assert.equal(afterSupportDamage.players.p2.actors[0].def, 1005, "support-caused damage invokes the target owner's on_damage_taken support");
const destroyedSupport: BattleCard = { ...supportCard, cardId: "destroyed-support", instanceId: "p2-destroyed-support", supportDefinition: { ...supportDefinition, timing: "on_card_destroyed", target_scope: "ally_support", consume_on_play: false, conditions: { type: "on_card_destroyed" }, effects: [{ type: "stat_modifier", target: "ally_support", stat: "atk", value: 5, duration: 1 }] } };
const fatalDamageSupport: BattleCard = { ...supportCard, cardId: "fatal-support", instanceId: "p1-fatal-support", supportDefinition: { ...supportDefinition, target_scope: "enemy_front", effects: [{ type: "damage", target: "enemy_front", value: 1000 }] } };
const destroyedState = createBattle({ battleId: "battle-destroyed", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [weakCard("fatal-actor")], hand: [fatalDamageSupport] }, { playerId: "p2", cards: [{ ...weakCard("destroyed-front"), hp: 1 }, weakCard("destroyed-support-actor")], initialFieldCardIds: ["destroyed-front", "destroyed-support-actor"], hand: [destroyedSupport] }] });
const afterSupportDefeat = applyAction(destroyedState, { actionId: "fatal-support-play", battleId: "battle-destroyed", expectedVersion: 1, playerId: "p1", type: "use_support", supportInstanceId: "p1-fatal-support", targetInstanceIds: ["p2-actor-1"] }, { random: () => 0.5 });
assert.equal(afterSupportDefeat.players.p2.actors[0].defeated, true, "support damage can defeat its selected target");
assert.equal(afterSupportDefeat.players.p2.actors[1].statuses.some((status) => status.key === "modifier_atk"), true, "a defeated card triggers a valid on_card_destroyed support on its surviving ally");
assert.throws(() => applyAction(afterAttack, { actionId: "action-1", battleId: "battle-1", expectedVersion: afterAttack.version, playerId: "p2", type: "end_turn" }), /action already processed/);
assert.throws(() => applyAction(afterAttack, { actionId: "action-2", battleId: "battle-1", expectedVersion: 1, playerId: "p2", type: "end_turn" }), /stale battle version/);
console.log("battle engine tests passed");
