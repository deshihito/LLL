/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 }); const { id } = await params; const url = new URL(request.url); const after = Number(url.searchParams.get("after") ?? 0); const admin = createSupabaseAdminClient() as any;
    const { data: participant } = await admin.from("battle_players").select("battle_id").eq("battle_id", id).eq("player_id", user.id).maybeSingle(); if (!participant) return NextResponse.json({ error: "バトルが見つかりません" }, { status: 404 });
    const { data, error } = await admin.from("battle_events").select("id,sequence,event_type,source_player_id,payload,created_at").eq("battle_id", id).gt("sequence", Number.isFinite(after) ? after : 0).order("sequence", { ascending: true }).limit(100); if (error) throw error; return NextResponse.json({ events: data ?? [] });
  } catch { return NextResponse.json({ error: "イベントを取得できませんでした" }, { status: 500 }); }
}
