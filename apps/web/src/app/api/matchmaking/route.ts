/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const db = () => createSupabaseAdminClient() as any;

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const { data, error } = await db().from("matchmaking_queue").select("player_id,deck_id,status,queued_at,expires_at,battle_id").eq("player_id", user.id).maybeSingle();
    if (error) throw error;
    let battle = null;
    if (data?.battle_id) {
      const result = await db().from("battles").select("id,status,turn,active_player_id,winner_player_id,state_version").eq("id", data.battle_id).maybeSingle();
      if (result.error) throw result.error;
      battle = result.data;
    }
    return NextResponse.json({ entry: data, battle });
  } catch { return fail(500, "マッチング状態を取得できませんでした"); }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const body = await request.json().catch(() => ({}));
    const deckId = typeof body.deckId === "string" ? body.deckId : "";
    if (!deckId) return fail(400, "デッキを選択してください");
    const admin = db();
    const { data, error } = await admin.rpc("matchmake_and_create_battle", { p_player_id: user.id, p_deck_id: deckId });
    if (error) {
      const message = error.message ?? "";
      return fail(400, message.includes("DECK_NOT_OWNED") ? "デッキを選択してください" : message.includes("INVALID_ACTION_COUNT") ? "アクションカード1〜5枚のデッキが必要です" : "マッチング処理に失敗しました");
    }
    const battleId = data?.battleId ?? null;
    let battle = null;
    if (battleId) {
      const result = await admin.from("battles").select("id,status,turn,active_player_id,winner_player_id,state_version").eq("id", battleId).maybeSingle();
      if (result.error) throw result.error;
      battle = result.data;
    }
    const entry = data ? {
      ...data,
      queuedAt: data.queuedAt ?? data.queued_at ?? null,
      expiresAt: data.expiresAt ?? data.expires_at ?? null,
    } : null;
    return NextResponse.json({ entry, battleId, battle }, { status: battleId ? 201 : 200 });
  } catch { return fail(500, "マッチングに参加できませんでした"); }
}

export async function DELETE() {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const { error } = await db().rpc("cancel_matchmaking", { p_player_id: user.id });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch { return fail(500, "マッチングをキャンセルできませんでした"); }
}
