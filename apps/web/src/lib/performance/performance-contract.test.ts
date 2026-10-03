import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../../../../", import.meta.url).pathname;
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

const currentUser = read("apps/web/src/lib/auth/current-user.ts");
assert.equal(currentUser.includes("auth.admin.listUsers"), false);
assert.equal(currentUser.includes("profiles.upsert"), false);

const migration = read("infra/supabase/migrations/20261003040000_performance_indexes_and_matchmaking.sql");
assert.match(migration, /lll:matchmaking:player:/);
assert.equal(migration.includes("hashtextextended('lll:matchmaking', 0)"), false);
assert.match(migration, /for update skip locked/i);
assert.match(migration, /support_condition_matches_many/);

const home = read("apps/web/src/app/home-client.tsx");
assert.match(home, /\/api\/battles\/\$\{battle\.id\}\/events\?after=/);
assert.match(home, /stateUrl/);
assert.match(home, /refreshBattleStateRef\.current/);

console.log("performance contract tests passed");
