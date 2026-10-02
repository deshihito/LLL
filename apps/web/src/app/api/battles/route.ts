/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const db = () => createSupabaseAdminClient() as any;

export async function POST() {
  try {
    const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です");
    const admin = db(); const now = new Date().toISOString();
    await admin.from("matchmaking_queue").update({ status: "expired" }).eq("status", "queued").lt("expires_at", now);
    const { data: own } = await admin.from("matchmaking_queue").select("player_id,deck_id").eq("player_id", user.id).eq("status", "queued").maybeSingle(); if (!own) return fail(409, "マッチング待機中ではありません");
    const { data: opponent } = await admin.from("matchmaking_queue").select("player_id,deck_id").eq("status", "queued").neq("player_id", user.id).order("queued_at", { ascending: true }).limit(1).maybeSingle(); if (!opponent) return NextResponse.json({ status: "waiting" });
    const { data: battle, error: battleError } = await admin.from("battles").insert({ status: "active", turn: 1, active_player_id: own.player_id, started_at: now }).select().single(); if (battleError) throw battleError;
    const players = [{ battle_id: battle.id, player_id: own.player_id, deck_id: own.deck_id, seat: 1, ready_at: now }, { battle_id: battle.id, player_id: opponent.player_id, deck_id: opponent.deck_id, seat: 2, ready_at: now }];
    const { error: playersError } = await admin.from("battle_players").insert(players); if (playersError) throw playersError;
    for (const player of players) {
      const { data: deckCards, error } = await admin.from("deck_cards").select("card_id,slot_index,role").eq("deck_id", player.deck_id).order("slot_index", { ascending: true }); if (error) throw error;
      const ids = (deckCards ?? []).map((row: { card_id: string }) => row.card_id); const { data: cards, error: cardError } = await admin.from("cards").select("id,title,hp,atk,shield,speed,skills").in("id", ids); if (cardError) throw cardError;
      const snapshots = (deckCards ?? []).map((row: { card_id: string; slot_index: number; role: string }, index: number) => { const card = (cards ?? []).find((item: { id: string }) => item.id === row.card_id); return { battle_id: battle.id, player_id: player.player_id, source_card_id: row.card_id, instance_id: `${player.player_id}-${index + 1}`, title: card?.title ?? "カード", zone: row.role === "action" && index < 2 ? "field" : "deck", field_index: row.role === "action" && index < 2 ? index + 1 : null, hp: card?.hp ?? 1, max_hp: card?.hp ?? 1, atk: card?.atk ?? 1, def: card?.shield ?? 1, speed: card?.speed ?? 1, ap: 50, skills: card?.skills ?? [], statuses: [] }; });
      const { error: snapshotError } = await admin.from("battle_cards").insert(snapshots); if (snapshotError) throw snapshotError;
    }
    await admin.from("matchmaking_queue").update({ status: "matched", battle_id: battle.id }).in("player_id", [user.id, opponent.player_id]);
    return NextResponse.json({ battle }, { status: 201 });
  } catch (error) { console.error("battle create failed", error); return fail(500, "バトルを作成できませんでした"); }
}

export async function GET() { try { const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です"); const admin = db(); const { data: rows } = await admin.from("battle_players").select("battle_id,seat,joined_at,battles(id,status,turn,active_player_id,winner_player_id,state_version)").eq("player_id", user.id).order("joined_at", { ascending: false }).limit(10); return NextResponse.json({ battles: rows ?? [] }); } catch { return fail(500, "バトルを取得できませんでした"); } }
