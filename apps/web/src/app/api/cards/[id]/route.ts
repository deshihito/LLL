import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const admin = createSupabaseAdminClient();
    const { data: card, error: cardError } = await admin.from("cards").select("id,title,description,card_type,parent_card_id,hp,atk,shield,speed,weight_ratio,skills,support_definition,generation_status,scout_tier,trial_public,source_image_path,created_at,updated_at").eq("id", id).eq("owner_id", user.id).maybeSingle();
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (typeof body.trialPublic !== "boolean") return NextResponse.json({ error: "公開設定を確認してください" }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const { data: card, error: lookupError } = await admin.from("cards").select("id,card_type,generation_status").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!card) return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
    if (body.trialPublic && (card.card_type !== "action" || card.generation_status !== "ready")) return NextResponse.json({ error: "公開できるのは生成済みアクションカードだけです" }, { status: 409 });
    const { data, error } = await admin.from("cards").update({ trial_public: body.trialPublic }).eq("id", id).eq("owner_id", user.id).select("id,trial_public").single();
    if (error) throw error;
    return NextResponse.json({ card: data });
  } catch (error) {
    console.error("card sharing update failed", error);
    return NextResponse.json({ error: "公開設定を保存できませんでした" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { id } = await params;
    const admin = createSupabaseAdminClient();
    const { data: card, error: cardError } = await admin.from("cards").select("id,card_type,generation_status,source_image_path").eq("id", id).eq("owner_id", user.id).maybeSingle();
    if (cardError) throw cardError;
    if (!card) return NextResponse.json({ error: "データが見つかりません" }, { status: 404 });
    if (card.generation_status === "processing") return NextResponse.json({ error: "解析中のカードは削除できません。処理完了後にお試しください" }, { status: 409 });
    const imagePaths = card.source_image_path ? [card.source_image_path] : [];
    if (card.card_type === "action") {
      const { data: parts, error: partsError } = await admin.from("cards").select("source_image_path").eq("parent_card_id", id).eq("owner_id", user.id);
      if (partsError) throw partsError;
      imagePaths.push(...(parts ?? []).map((part) => part.source_image_path).filter((path): path is string => Boolean(path)));
    }
    const { error } = await admin.from("cards").delete().eq("id", id).eq("owner_id", user.id);
    if (error) throw error;
    if (imagePaths.length) {
      const { error: storageError } = await admin.storage.from("card-images").remove([...new Set(imagePaths)]);
      if (storageError) console.error("card image cleanup failed after card deletion", storageError);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("card delete failed", error);
    return NextResponse.json({ error: "カードを削除できませんでした" }, { status: 500 });
  }
}
