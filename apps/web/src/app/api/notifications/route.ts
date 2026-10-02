import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
export async function GET() { try { const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です"); const { data, error } = await createSupabaseAdminClient().from("notifications").select("id,notification_type,title,body,metadata,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }); if (error) throw error; return NextResponse.json({ notifications: data ?? [], unreadCount: (data ?? []).filter((item) => !item.read_at).length }); } catch (error) { console.error("notifications list failed", error); return fail(500, "保存に失敗しました"); } }
