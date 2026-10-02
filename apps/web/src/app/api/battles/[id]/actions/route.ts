/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const db = () => createSupabaseAdminClient() as any;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です");
    const { id: battleId } = await params; const body = await request.json().catch(() => ({}));
    const clientActionId = typeof body.actionId === "string" ? body.actionId : ""; const actionType = typeof body.type === "string" ? body.type : ""; const expectedVersion = Number(body.expectedVersion);
    if (!clientActionId || !["use_skill", "end_turn", "equip_part", "play_action"].includes(actionType) || !Number.isInteger(expectedVersion)) return fail(400, "操作内容を確認してください");
    const admin = db(); const { data: participant } = await admin.from("battle_players").select("battle_id").eq("battle_id", battleId).eq("player_id", user.id).maybeSingle(); if (!participant) return fail(404, "バトルが見つかりません");
    const { data: existing } = await admin.from("battle_actions").select("id,status,reject_reason").eq("battle_id", battleId).eq("client_action_id", clientActionId).maybeSingle(); if (existing) return NextResponse.json({ action: existing });
    const { data: battle } = await admin.from("battles").select("id,status,turn,active_player_id,state_version").eq("id", battleId).maybeSingle(); if (!battle || battle.status !== "active") return fail(409, "バトルは操作できません");
    if (battle.state_version !== expectedVersion || battle.active_player_id !== user.id) return fail(409, "バトル状態が更新されています。再読み込みしてください");
    const { data: action, error } = await admin.from("battle_actions").insert({ battle_id: battleId, player_id: user.id, client_action_id: clientActionId, expected_version: expectedVersion, action_type: actionType, payload: body }).select().single(); if (error) throw error;
    if (actionType === "end_turn") {
      const { data: players } = await admin.from("battle_players").select("player_id,seat").eq("battle_id", battleId).order("seat", { ascending: true }); const next = (players ?? []).find((player: { player_id: string }) => player.player_id !== user.id);
      const nextVersion = battle.state_version + 1; const { error: updateError } = await admin.from("battles").update({ active_player_id: next?.player_id ?? null, turn: battle.turn + 1, state_version: nextVersion }).eq("id", battleId).eq("state_version", expectedVersion); if (updateError) throw updateError;
      const { data: latest } = await admin.from("battle_events").select("sequence").eq("battle_id", battleId).order("sequence", { ascending: false }).limit(1).maybeSingle(); const sequence = (latest?.sequence ?? 0) + 1;
      const { error: eventError } = await admin.from("battle_events").insert({ battle_id: battleId, sequence, action_id: action.id, event_type: "turn_ended", source_player_id: user.id, payload: { turn: battle.turn + 1, activePlayerId: next?.player_id ?? null, stateVersion: nextVersion } }); if (eventError) throw eventError;
    }
    return NextResponse.json({ action }, { status: 201 });
  } catch (error) { console.error("battle action failed", error); return fail(500, "操作を登録できませんでした"); }
}
