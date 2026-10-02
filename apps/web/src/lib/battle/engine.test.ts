import assert from "node:assert/strict";
import { applyAction, calculateDamage, createBattle } from "./engine.ts";
import type { BattleCard } from "./types.ts";

const attackCard = (cardId: string, speed = 20): BattleCard => ({
  cardId, title: cardId, hp: 100, atk: 100, shield: 50, speed,
  skills: [{ slot: 1, name: "攻撃", cost: 50, turn_behavior: "end", effects: [{ type: "damage", target: "enemy_front", value: 50 }] }],
});

const first = attackCard("a");
const second = attackCard("b");
const initial = createBattle({ battleId: "battle-1", firstPlayerId: "p1", players: [{ playerId: "p1", cards: [first] }, { playerId: "p2", cards: [second] }] });

assert.equal(calculateDamage(50, 100, 50, () => 0.5).damage, 200);
const afterAttack = applyAction(initial, { actionId: "action-1", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "use_skill", actorInstanceId: "p1-actor-1", skillSlot: 1, targetInstanceIds: ["p2-actor-1"] }, { random: () => 0.5 });
assert.equal(afterAttack.players.p2.actors[0].hp, 0);
assert.equal(afterAttack.players.p2.actors[0].defeated, true);
assert.equal(afterAttack.activePlayerId, "p2");
assert.equal(afterAttack.players.p2.actors[0].ap, 50);
const afterEnd = applyAction(initial, { actionId: "end-1", battleId: "battle-1", expectedVersion: 1, playerId: "p1", type: "end_turn" });
assert.equal(afterEnd.players.p2.actors[0].ap, 70);
assert.throws(() => applyAction(afterAttack, { actionId: "action-1", battleId: "battle-1", expectedVersion: afterAttack.version, playerId: "p2", type: "end_turn" }), /action already processed/);
assert.throws(() => applyAction(afterAttack, { actionId: "action-2", battleId: "battle-1", expectedVersion: 1, playerId: "p2", type: "end_turn" }), /stale battle version/);
console.log("battle engine tests passed");
