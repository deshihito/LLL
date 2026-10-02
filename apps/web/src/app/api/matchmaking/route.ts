/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const db = () => createSupabaseAdminClient() as any;

export async function GET() { try { const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です"); const { data, error } = await db().from("matchmaking_queue").select("player_id,deck_id,status,queued_at,expires_at,battle_id").eq("player_id", user.id).maybeSingle(); if (error) throw error; return NextResponse.json({ entry: data }); } catch { return fail(500, "マッチング状態を取得できませんでした"); } }
export async function POST(request: Request) { try { const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です"); const body = await request.json().catch(() => ({})); const deckId = typeof body.deckId === "string" ? body.deckId : ""; if (!deckId) return fail(400, "デッキを選択してください"); const { data, error } = await db().rpc("matchmake_and_create_battle", { p_player_id: user.id, p_deck_id: deckId }); if (error) { const message = error.message ?? ""; return fail(400, message.includes("DECK_NOT_OWNED") ? "デッキを選択してください" : message.includes("INVALID_ACTION_COUNT") ? "アクションカード1〜5枚のデッキが必要です" : "マッチング処理に失敗しました"); } return NextResponse.json({ entry: data, battleId: data?.battleId ?? null }, { status: data?.battleId ? 201 : 200 }); } catch { return fail(500, "マッチングに参加できませんでした"); } }
export async function DELETE() { try { const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です"); const { error } = await db().rpc("cancel_matchmaking", { p_player_id: user.id }); if (error) throw error; return NextResponse.json({ ok: true }); } catch { return fail(500, "マッチングをキャンセルできませんでした"); } }
