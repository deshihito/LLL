import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** A DB-atomic budget works across serverless replicas. Missing migration fails closed. */
export async function checkOperationBudget(actorId: string, operation: "card_upload" | "card_generation" | "battle_action") {
  const requestId = crypto.randomUUID();
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("consume_api_operation", { p_actor_id: actorId, p_operation: operation, p_request_id: requestId });
    if (error) throw error;
    if (data !== true) return NextResponse.json({ error: "操作回数の上限に達しました。時間をおいてお試しください。", requestId }, { status: 429, headers: { "Retry-After": operation === "battle_action" ? "60" : "3600", "X-Request-ID": requestId } });
    return null;
  } catch (error) {
    console.error("operation budget unavailable", { requestId, operation, code: error && typeof error === "object" && "code" in error ? error.code : "unknown" });
    return NextResponse.json({ error: "安全確認サービスを利用できません。管理者はDB migrationの適用を確認してください。", requestId }, { status: 503, headers: { "X-Request-ID": requestId } });
  }
}
