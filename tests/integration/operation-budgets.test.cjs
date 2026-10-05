// Supply PGLITE_MODULE when the optional validator is installed outside root node_modules.
const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table public.profiles(id uuid primary key); insert into public.profiles values ('00000000-0000-4000-8000-000000000001');");
    await db.exec(fs.readFileSync(path.join(__dirname, "../../infra/supabase/migrations/20261005000000_operation_budgets.sql"), "utf8"));
    const actor = "00000000-0000-4000-8000-000000000001";
    await db.exec("set role service_role");
    for (const [operation, limit] of [["card_generation", 12], ["card_upload", 30], ["battle_action", 120]]) {
      for (let count = 1; count <= limit + 2; count++) {
        const result = await db.query("select public.consume_api_operation($1,$2,$3) as allowed", [actor, operation, crypto.randomUUID()]);
        assert.equal(result.rows[0].allowed, count <= limit, `${operation} request ${count}`);
      }
    }
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int as count from api_operation_audit")).rows[0].count, 168);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select public.consume_api_operation($1,$2,$3)", [actor, "card_upload", crypto.randomUUID()]), /permission denied/);
      await assert.rejects(db.query("select * from public.api_operation_audit"), /permission denied/);
      await db.exec("reset role");
    }
    await assert.rejects(db.query("select public.consume_api_operation($1,$2,$3)", [actor, "wrong", crypto.randomUUID()]), /UNKNOWN_OPERATION/);
    console.log("operation budget migration, quotas and privileges passed (isolated PostgreSQL)");
  } finally { await db.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
