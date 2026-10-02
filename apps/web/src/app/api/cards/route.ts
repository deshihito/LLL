import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Image is required" }, { status: 400 });
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "画像は10MB以下の画像ファイルを選択してください" }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const bucket = await supabase.storage.getBucket("card-images");
    if (bucket.error && bucket.error.message.toLowerCase().includes("not found")) {
      const createdBucket = await supabase.storage.createBucket("card-images", { public: false });
      if (createdBucket.error && !createdBucket.error.message.toLowerCase().includes("already exists")) throw createdBucket.error;
    } else if (bucket.error) {
      throw bucket.error;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const upload = await supabase.storage.from("card-images").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const { data: card, error: cardError } = await supabase.from("cards").insert({ owner_id: user.id, card_type: "action", title: "下書きカード", source_image_path: path, generation_status: "draft" }).select().single();
    if (cardError) throw cardError;
    const { data: job, error: jobError } = await supabase.from("card_generation_jobs").insert({ user_id: user.id, card_id: card.id, source_image_path: path, status: "queued" }).select().single();
    if (jobError) throw jobError;
    return NextResponse.json({ card, job }, { status: 201 });
  } catch (error) {
    console.error("card upload failed", error);
    const detail = error instanceof Error ? error.message.toLowerCase() : "";
    const errorMessage = detail.includes("missing environment") ? "Supabase接続設定がありません" : detail.includes("bucket") || detail.includes("storage") ? "Supabase Storageの設定を確認してください" : detail.includes("profile") || detail.includes("foreign key") ? "Supabaseのプロフィール設定を確認してください" : "画像の保存に失敗しました";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
