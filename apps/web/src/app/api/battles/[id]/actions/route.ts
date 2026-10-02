/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
const db = () => createSupabaseAdminClient() as any;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
function messageFor(message: string) { const map: Record<string, string> = { BATTLE_NOT_FOUND: "バトルが見つかりません", BATTLE_NOT_ACTIVE: "バトルは終了しています", STALE_BATTLE_STATE: "バトル状態が更新されています。再読み込みしてください", ACTOR_NOT_AVAILABLE: "そのカードは行動できません", SKILL_NOT_FOUND: "技が見つかりません", NOT_ENOUGH_AP: "APが不足しています", UNSUPPORTED_ACTION: "未対応の操作です" }; return Object.entries(map).find(([key]) => message.includes(key))?.[1] ?? "操作を処理できませんでした"; }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です");
    const { id } = await params; const body = await request.json().catch(() => ({}));
    const actionId = typeof body.actionId === "string" ? body.actionId : ""; const type = typeof body.type === "string" ? body.type : ""; const expectedVersion = Number(body.expectedVersion);
    if (!actionId || !["use_skill", "end_turn"].includes(type) || !Number.isInteger(expectedVersion)) return fail(400, "操作内容を確認してください");
    const { data, error } = await db().rpc("apply_battle_action", { p_battle_id: id, p_player_id: user.id, p_client_action_id: actionId, p_expected_version: expectedVersion, p_action_type: type, p_payload: body });
    if (error) return fail(error.message.includes("STALE_BATTLE_STATE") ? 409 : 400, messageFor(error.message));
    return NextResponse.json({ action: data }, { status: data?.status === "duplicate" ? 200 : 201 });
  } catch { return fail(500, "操作を処理できませんでした"); }
}
