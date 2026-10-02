import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "Image is required" }, { status: 400 });
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "画像は10MB以下の画像ファイルを選択してください" }, { status: 400 });

  try {
    const supabase = createSupabaseAdminClient();
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const upload = await supabase.storage.from("card-images").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const { data: card, error: cardError } = await supabase.from("cards").insert({ owner_id: userId, card_type: "action", title: "下書きカード", source_image_path: path, generation_status: "draft" }).select().single();
    if (cardError) throw cardError;
    const { data: job, error: jobError } = await supabase.from("card_generation_jobs").insert({ user_id: userId, card_id: card.id, source_image_path: path, status: "queued" }).select().single();
    if (jobError) throw jobError;
    return NextResponse.json({ card, job }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "画像の保存に失敗しました" }, { status: 500 });
  }
}
