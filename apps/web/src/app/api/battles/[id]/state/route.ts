/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BATTLE_CONFIG } from "@/lib/battle/config";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const db = () => createSupabaseAdminClient() as any;

function targetsForSupport(scope: string, ownerId: string, cards: any[]) {
  const owner = cards.filter((card) => card.player_id === ownerId && card.zone === "field" && !card.defeated).sort((a, b) => (a.field_index ?? 0) - (b.field_index ?? 0));
  const enemy = cards.filter((card) => card.player_id !== ownerId && card.zone === "field" && !card.defeated).sort((a, b) => (a.field_index ?? 0) - (b.field_index ?? 0));
  const picked = scope === "self" || scope === "ally_front" ? owner.slice(0, 1)
    : scope === "ally_support" ? owner.slice(1, 2)
      : scope === "all_allies" ? owner
        : scope === "enemy_front" ? enemy.slice(0, 1)
          : scope === "enemy_support" ? enemy.slice(1, 2)
            : scope === "all_enemies" ? enemy : [];
  return picked.map((card) => ({ instanceId: card.instance_id, title: card.title }));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const { id } = await params;
    const admin = db();
    const { data: participant, error: participantError } = await admin.from("battle_players").select("battle_id").eq("battle_id", id).eq("player_id", user.id).maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return fail(404, "バトルが見つかりません");
    const sinceParam = new URL(request.url).searchParams.get("since");
    const since = sinceParam === null ? Number.NaN : Number(sinceParam);
    const { data: version, error: versionError } = await admin.from("battles").select("id,status,turn,active_player_id,winner_player_id,state_version,updated_at").eq("id", id).maybeSingle();
    if (versionError) throw versionError;
    if (!version) return fail(404, "バトルが見つかりません");
    if (Number.isSafeInteger(since) && since >= 0 && since === version.state_version) {
      return NextResponse.json({ unchanged: true, stateVersion: version.state_version, battle: version });
    }
    const [{ data: battle, error: battleError }, { data: players, error: playersError }, { data: allCards, error: cardsError }] = await Promise.all([
      admin.from("battles").select("id,status,turn,active_player_id,winner_player_id,state_version,updated_at").eq("id", id).maybeSingle(),
      admin.from("battle_players").select("player_id,seat").eq("battle_id", id).order("seat", { ascending: true }),
      admin.from("battle_cards").select("id,source_card_id,instance_id,player_id,title,description,card_type,support_definition,support_uses,equipped_part_ids,zone,field_index,hp,max_hp,atk,def,speed,ap,skills,statuses,defeated").eq("battle_id", id).in("zone", ["field", "hand"]).order("field_index", { ascending: true }),
    ]);
    if (battleError) throw battleError;
    if (playersError) throw playersError;
    if (cardsError) throw cardsError;
    if (!battle) return fail(404, "バトルが見つかりません");
    const cards = (allCards ?? []).filter((card: any) => card.zone === "field" || (card.zone === "hand" && card.player_id === user.id));
    const fieldCards = cards.filter((card: any) => card.zone === "field");
    const handSupports = cards.filter((card: any) => card.zone === "hand" && card.card_type === "support");
    const readiness = new Map<string, boolean>();
    const conditionItems = handSupports.flatMap((card: any) => {
      const definition = card.support_definition && typeof card.support_definition === "object" ? card.support_definition as Record<string, any> : null;
      const targets = targetsForSupport(String(definition?.target_scope ?? ""), user.id, fieldCards);
      const eligible = Boolean(definition && targets.length && definition.timing === "on_play" && Number(card.support_uses ?? 0) < Number(definition.max_uses_per_battle ?? 0));
      if (!eligible) { readiness.set(card.instance_id, false); return []; }
      return [{ instanceId: card.instance_id, conditions: definition?.conditions ?? {}, targetIds: targets.map((target: any) => target.instanceId) }];
    });
    if (conditionItems.length) {
      const { data, error } = await admin.rpc("support_condition_matches_many", { p_items: conditionItems, p_battle_id: id, p_player_id: user.id, p_turn: battle.turn });
      if (error) {
        // A partially applied migration must not prevent the whole battle board from rendering.
        // Supports remain unavailable until the authoritative condition RPC is available.
        console.warn("support condition RPC unavailable", { code: error.code, message: error.message });
        for (const item of conditionItems) readiness.set(item.instanceId, false);
      } else {
        for (const item of conditionItems) readiness.set(item.instanceId, data?.[item.instanceId] === true);
      }
    }
    const viewCards = cards.map((card: any) => {
      const publicCard = Object.fromEntries(Object.entries(card).filter(([key]) => key !== "support_definition"));
      const base = { ...publicCard, instanceId: card.instance_id, playerId: card.player_id, maxHp: card.max_hp, maxAp: BATTLE_CONFIG.maxAp, cardType: card.card_type };
      if (card.zone !== "hand" || card.card_type !== "support") return base;
      const definition = card.support_definition && typeof card.support_definition === "object" ? card.support_definition as Record<string, any> : null;
      const maximum = Number(definition?.max_uses_per_battle ?? 0);
      const uses = Number(card.support_uses ?? 0);
      return { ...base, supportInfo: { description: card.description ?? "", timing: definition?.timing ?? "", targetScope: definition?.target_scope ?? "", consumeOnPlay: definition?.consume_on_play === true, useCount: uses, maxUses: maximum, canUse: readiness.get(card.instance_id) === true, targets: targetsForSupport(String(definition?.target_scope ?? ""), user.id, fieldCards) } };
    });
    return NextResponse.json({ state: { currentPlayerId: user.id, battle, players: players ?? [], cards: viewCards } });
  } catch (error) {
    console.error("battle state read failed", error instanceof Error ? { message: error.message, stack: error.stack } : error);
    return fail(500, "対戦状態を取得できませんでした");
  }
}
