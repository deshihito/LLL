import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("profiles").select("id, username, avatar_url, level, experience").eq("id", user.id).single();
    if (error) throw error;
    return NextResponse.json({ profile: data, email: user.email });
  } catch (error) {
    console.error("profile read failed", error);
    return NextResponse.json({ error: "プロフィールを取得できませんでした" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json() as { username?: unknown };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (username.length < 1 || username.length > 80) return NextResponse.json({ error: "表示名は1〜80文字で入力してください" }, { status: 400 });
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("profiles").update({ username }).eq("id", user.id).select("id, username, avatar_url, level, experience").single();
    if (error) throw error;
    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error("profile update failed", error);
    return NextResponse.json({ error: "プロフィールを更新できませんでした" }, { status: 500 });
  }
}
