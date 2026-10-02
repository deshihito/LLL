/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BATTLE_CONFIG } from "@/lib/battle/config";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const db = () => createSupabaseAdminClient() as any;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const { id } = await params;
    const admin = db();
    const { data: participant, error: participantError } = await admin.from("battle_players").select("battle_id").eq("battle_id", id).eq("player_id", user.id).maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return fail(404, "バトルが見つかりません");
    const [{ data: battle, error: battleError }, { data: players, error: playersError }, { data: cards, error: cardsError }] = await Promise.all([
      admin.from("battles").select("id,status,turn,active_player_id,winner_player_id,state_version,updated_at").eq("id", id).maybeSingle(),
      admin.from("battle_players").select("player_id,seat").eq("battle_id", id).order("seat", { ascending: true }),
      admin.from("battle_cards").select("id,source_card_id,instance_id,player_id,title,zone,field_index,hp,max_hp,atk,def,speed,ap,skills,statuses,defeated").eq("battle_id", id).eq("zone", "field").order("field_index", { ascending: true }),
    ]);
    if (battleError) throw battleError;
    if (playersError) throw playersError;
    if (cardsError) throw cardsError;
    if (!battle) return fail(404, "バトルが見つかりません");
    return NextResponse.json({ state: { currentPlayerId: user.id, battle, players: players ?? [], cards: (cards ?? []).map((card: any) => ({ ...card, instanceId: card.instance_id, playerId: card.player_id, maxHp: card.max_hp, maxAp: BATTLE_CONFIG.maxAp })) } });
  } catch (error) {
    console.error("battle state read failed", error);
    return fail(500, "対戦状態を取得できませんでした");
  }
}
