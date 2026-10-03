import assert from "node:assert/strict";
import { normalizeSupportDefinition, validateSupportDefinition } from "./support-schema.ts";

const valid = {
  version: 1,
  timing: "on_play",
  target_scope: "ally_front",
  cost: 0,
  consume_on_play: true,
  max_uses_per_battle: 1,
  conditions: { all: [{ type: "always" }] },
  effects: [{ type: "heal", target: "ally_front", value: 100 }],
};
assert.equal(validateSupportDefinition(valid), true);
assert.equal(validateSupportDefinition(normalizeSupportDefinition({ ...valid, cost: "0" })), true);
assert.equal(validateSupportDefinition(normalizeSupportDefinition({ ...valid, effects: [{ type: "status_apply", target: "ally_front", key: "stun", duration: 1 }] })), true, "stun uses duration and may omit value");
assert.deepEqual((normalizeSupportDefinition({ ...valid, effects: [{ type: "status_apply", target: "ally_front", key: "stun", value: 100, duration: 1 }] }) as typeof valid).effects[0], { type: "status_apply", target: "ally_front", key: "stun", value: 0, duration: 1 });
const ambiguousConditions = normalizeSupportDefinition({ ...valid, conditions: { all: [{ type: "always" }], any: [{ type: "hp_below", value: 50 }] } });
assert.deepEqual((ambiguousConditions as typeof valid).conditions, { all: [{ type: "always" }] }, "all takes precedence and the persisted condition tree is canonicalized for SQL");
assert.equal(validateSupportDefinition(ambiguousConditions), true);
assert.equal(validateSupportDefinition({ ...valid, cost: 100 }), false, "support plays do not consume AP");
assert.equal(validateSupportDefinition({ ...valid, max_uses_per_battle: 4 }), false);
assert.equal(validateSupportDefinition({ ...valid, timing: "on_random_event" }), false);
assert.equal(validateSupportDefinition({ ...valid, extra: "ignored" }), false);
assert.equal(validateSupportDefinition({ ...valid, conditions: { all: [{ type: "status_present", target: "random_enemy", key: "burn" }] } }), false);
assert.equal(validateSupportDefinition({ ...valid, timing: "on_card_destroyed", conditions: { type: "on_card_destroyed" } }), true, "destruction-timed supports accept their corresponding event condition");
assert.equal(validateSupportDefinition({ ...valid, effects: [{ type: "damage", target: "random_enemy", value: 50 }] }), false);
assert.equal(validateSupportDefinition({ ...valid, effects: [{ type: "equip_part", target: "ally_front", key: "part-1" }] }), false);
assert.equal(validateSupportDefinition({ ...valid, effects: [{ type: "heal", target: "ally_front", value: 100, hidden: true }] }), false);
console.log("support schema tests passed");
