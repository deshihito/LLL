import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
export async function POST() { try { const user = await requireCurrentUser(); if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 }); const { error } = await createSupabaseAdminClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null); if (error) throw error; return NextResponse.json({ ok: true }); } catch (error) { console.error("notifications read all failed", error); return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 }); } }
