import assert from "node:assert/strict";
import { inspectCardQuality } from "./card-quality.ts";
import { applyAction, createBattle } from "./engine.ts";
import type { BattleCard } from "./types.ts";

const skill = { name: "光撃", description: "敵に威力50の攻撃", skill_type: "active", cost: 100, conditions: { type: "always" }, effects: [{ type: "damage", target: "enemy_front", value: 50 }] };
const card = { title: "光の剣士", description: "練習カード", card_type: "action", hp: 100, atk: 90, shield: 30, speed: 40, skills: [skill] };
assert.deepEqual(inspectCardQuality(card), []);
for (const effects of [[{ type: "teleport", target: "self", value: 20 }], [{ type: "damage", target: "enemy_front", value: 100000 }], [{ type: "damage", target: "random_enemy", value: 50 }], [{ type: "equip_part", target: "self", key: "foo" }], [{ type: "heal", target: "self", value: -1 }], [{ type: "damage", target: "enemy_front", value: 1.5 }]]) {
  assert.ok(inspectCardQuality({ ...card, skills: [{ ...skill, effects }] }).length);
}
assert.ok(inspectCardQuality({ ...card, title: " " }).length);
assert.ok(inspectCardQuality({ ...card, skills: [{ ...skill, conditions: { type: "part_equipped", key: "a" } }] }).length);
assert.ok(inspectCardQuality({ ...card, card_type: "support", skills: [] }).length);
assert.ok(inspectCardQuality({ ...card, card_type: "part", hp: 0, atk: 0, shield: 0, speed: 0 }).length);
const actor: BattleCard = { cardId: "a", title: "剣士", hp: 100, atk: 90, shield: 30, speed: 40, skills: [{ ...skill, slot: 1, skill_type: "active", effects: [{ type: "damage", target: "enemy_front", value: 50 }] }] };
const make = (seed: number) => createBattle({ battleId: "seeded", firstPlayerId: "p1", seed, players: [{ playerId: "p1", cards: [actor] }, { playerId: "p2", cards: [{ ...actor, cardId: "b" }] }] });
const action = { actionId: "a1", battleId: "seeded", expectedVersion: 1, playerId: "p1", type: "use_skill" as const, actorInstanceId: "p1-actor-1", skillSlot: 1, targetInstanceIds: ["p2-actor-1"] };
assert.deepEqual(applyAction(make(42), action), applyAction(make(42), action));
assert.deepEqual(applyAction(JSON.parse(JSON.stringify(make(42))), action), applyAction(make(42), action));
assert.notEqual(applyAction(make(42), action).randomState, make(42).randomState);
assert.throws(() => applyAction(make(42), { ...action, targetInstanceIds: ["p2-actor-1", "bad"] }), /target is invalid/);
assert.throws(() => applyAction({ ...make(42), rulesetVersion: "future" }, action), /unsupported ruleset/);
assert.throws(() => applyAction({ ...make(42), phase: "finished" }, action), /not active/);
console.log("domain quality and deterministic serialization tests passed");

const applied = applyAction(make(42), action);
assert.deepEqual(applyAction(applied, action), applied, "identical retransmission is a no-op even with its old version");
assert.throws(() => applyAction(applied, { ...action, skillSlot: 2 }), /different payload/);
assert.equal(applied.processedActionIds.length, 1);
