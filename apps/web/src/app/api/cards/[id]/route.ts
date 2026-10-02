import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const admin = createSupabaseAdminClient();
    const { data: card, error: cardError } = await admin.from("cards").select("id,title,description,card_type,hp,atk,shield,speed,weight_ratio,skills,generation_status,source_image_path,created_at,updated_at").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (cardError) throw cardError;
    if (!card) return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
    const { data: skills, error: skillsError } = await admin.from("card_skills").select("id,slot,name,description,skill_type,power,cost,conditions,effects").eq("card_id", card.id).order("slot", { ascending: true });
    if (skillsError) throw skillsError;
    return NextResponse.json({ card, skills: skills ?? [] });
  } catch (error) {
    console.error("card detail failed", error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
