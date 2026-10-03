/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const { id } = await params;
    const admin = createSupabaseAdminClient() as any;
    const { data: participant, error: participantError } = await admin.from("battle_players").select("battle_id").eq("battle_id", id).eq("player_id", user.id).maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return fail(404, "バトルが見つかりません");

    const { data, error } = await admin.rpc("surrender_battle", { p_battle_id: id, p_player_id: user.id });
    if (!error) return NextResponse.json({ result: data });

    // The UI must remain escapable even when the newest migration has not reached the DB yet.
    const { data: battle, error: battleError } = await admin.from("battles").select("id,status,turn,state_version").eq("id", id).maybeSingle();
    if (battleError || !battle) return fail(404, "バトルが見つかりません");
    if (battle.status !== "active") return NextResponse.json({ result: { status: battle.status, battleId: id } });
    const { data: opponent, error: opponentError } = await admin.from("battle_players").select("player_id").eq("battle_id", id).neq("player_id", user.id).maybeSingle();
    if (opponentError || !opponent) return fail(409, "対戦相手を確認できません");
    const nextVersion = Number(battle.state_version ?? 1) + 1;
    const { error: updateError } = await admin.from("battles").update({ status: "finished", winner_player_id: opponent.player_id, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), state_version: nextVersion }).eq("id", id).eq("status", "active");
    if (updateError) return fail(409, "対戦を終了できませんでした");
    const { data: lastEvent } = await admin.from("battle_events").select("sequence").eq("battle_id", id).order("sequence", { ascending: false }).limit(1).maybeSingle();
    await admin.from("battle_events").insert({ battle_id: id, sequence: Number(lastEvent?.sequence ?? 0) + 1, event_type: "battle_finished", source_player_id: user.id, payload: { winnerPlayerId: opponent.player_id, finishReason: "surrender", turn: battle.turn } });
    return NextResponse.json({ result: { status: "finished", battleId: id, winnerPlayerId: opponent.player_id, finishReason: "surrender", stateVersion: nextVersion } });
  } catch (error) {
    console.error("battle surrender failed", error instanceof Error ? { message: error.message, stack: error.stack } : error);
    return fail(500, "対戦を終了できませんでした");
  }
}
