/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const db = () => createSupabaseAdminClient() as any;
export async function POST() { return GET(); }
export async function GET() { try { const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です"); const { data: rows, error } = await db().from("battle_players").select("battle_id,seat,joined_at,battles(id,status,turn,active_player_id,winner_player_id,state_version)").eq("player_id", user.id).order("joined_at", { ascending: false }).limit(10); if (error) throw error; return NextResponse.json({ battles: rows ?? [] }); } catch { return fail(500, "バトルを取得できませんでした"); } }
