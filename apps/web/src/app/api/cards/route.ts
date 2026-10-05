import { NextResponse } from "next/server";
import { checkOperationBudget } from "@/lib/security/operation-budget";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import type { Json } from "@/lib/supabase/database.types";

function derivedPartSkills(value: unknown, index: number): Json {
  const source = Array.isArray(value) ? value[index] : null;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const skill = source as Record<string, unknown>;
    return [{
      ...skill,
      skill_type: "passive",
      cost: 0,
      turn_behavior: "continue",
      conditions: { type: "on_turn_start" },
    }] as unknown as Json;
  }
  return [{
    name: `自動パーツ${index + 1}`,
    description: "装着したアクションカードを補助する。",
    skill_type: "passive",
    cost: 0,
    turn_behavior: "continue",
    conditions: { type: "on_turn_start" },
    effects: [{ type: "stat_modifier", target: "self", stat: "atk", value: 5, duration: 1 }],
  }] as unknown as Json;
}

async function ensureActionParts(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string, cards: Array<Record<string, unknown>>) {
  const actions = cards.filter((card) => card.card_type === "action" && card.generation_status === "ready");
  for (const action of actions) {
    const actionId = typeof action.id === "string" ? action.id : "";
    if (!actionId) continue;
    const { data: parts, error } = await admin.from("cards").select("id").eq("owner_id", userId).eq("parent_card_id", actionId).eq("card_type", "part").eq("generation_status", "ready").order("created_at", { ascending: true }).limit(2);
    if (error) throw error;
    for (let index = parts?.length ?? 0; index < 2; index += 1) {
      const { error: insertError } = await admin.from("cards").insert({
        owner_id: userId,
        card_type: "part",
        parent_card_id: actionId,
        title: `${typeof action.title === "string" ? action.title : "アクション"} パーツ${index + 1}`,
        description: "親アクションに自動装着されるパーツカードです。",
        source_image_path: null,
        hp: 0,
        atk: 0,
        shield: 0,
        speed: 0,
        weight_ratio: "1:1:1:1",
        skills: derivedPartSkills(action.skills, index),
        program_flow: [],
        scout_tier: action.scout_tier === "elite" || action.scout_tier === "legend" ? action.scout_tier : "normal",
        generation_status: "ready",
      });
      if (insertError) throw insertError;
    }
  }
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    const { data, error } = await createSupabaseAdminClient()
      .from("cards")
      .select("id,title,description,card_type,parent_card_id,hp,atk,shield,speed,weight_ratio,skills,support_definition,generation_status,scout_tier,trial_public,source_image_path,created_at,updated_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    await ensureActionParts(createSupabaseAdminClient(), user.id, (data ?? []) as Array<Record<string, unknown>>);
    const { data: refreshed, error: refreshError } = await createSupabaseAdminClient()
      .from("cards")
      .select("id,title,description,card_type,parent_card_id,hp,atk,shield,speed,weight_ratio,skills,support_definition,generation_status,scout_tier,trial_public,source_image_path,created_at,updated_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (refreshError) throw refreshError;
    return NextResponse.json({ cards: refreshed ?? [] });
  } catch (error) {
    console.error("cards list failed", error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const limited = await checkOperationBudget(user.id, "card_upload"); if (limited) return limited;
    const form = await request.formData();
    const file = form.get("image");
    const cardType = form.get("cardType");
    const scoutTier = form.get("scoutTier");
    const parentCardId = form.get("parentCardId");
    if (!(file instanceof File)) return NextResponse.json({ error: "Image is required" }, { status: 400 });
    if (!["action", "support", "part"].includes(String(cardType)) || !["normal", "elite", "legend"].includes(String(scoutTier))) return NextResponse.json({ error: "スカウト種別を選択してください" }, { status: 400 });
    if (String(cardType) === "part" && typeof parentCardId !== "string") return NextResponse.json({ error: "パーツを装着するアクションカードを選択してください" }, { status: 400 });
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "PNG・JPG・WEBP形式で10MB以下の画像を選択してください" }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const bucket = await supabase.storage.getBucket("card-images");
    if (bucket.error && bucket.error.message.toLowerCase().includes("not found")) {
      const createdBucket = await supabase.storage.createBucket("card-images", { public: false });
      if (createdBucket.error && !createdBucket.error.message.toLowerCase().includes("already exists")) throw createdBucket.error;
    } else if (bucket.error) {
      throw bucket.error;
    }

    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const imageBytes = new Uint8Array(await file.arrayBuffer());
    const signatureValid = file.type === "image/png"
      ? imageBytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => imageBytes[index] === byte)
      : file.type === "image/jpeg"
        ? imageBytes.length >= 3 && imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff
        : imageBytes.length >= 12 && String.fromCharCode(...imageBytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...imageBytes.slice(8, 12)) === "WEBP";
    if (!signatureValid) return NextResponse.json({ error: "画像ファイルの内容を確認できませんでした" }, { status: 400 });
    const upload = await supabase.storage.from("card-images").upload(path, imageBytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    let parentId: string | null = null;
    if (String(cardType) === "part") { const { data: parent, error: parentError } = await supabase.from("cards").select("id").eq("id", String(parentCardId)).eq("owner_id", user.id).eq("card_type", "action").maybeSingle(); if (parentError) throw parentError; if (!parent) return NextResponse.json({ error: "装着先アクションが見つかりません" }, { status: 404 }); parentId = parent.id; }
    const { data: card, error: cardError } = await supabase.from("cards").insert({ owner_id: user.id, card_type: String(cardType) as "action" | "support" | "part", parent_card_id: parentId, title: "下書きカード", source_image_path: path, scout_tier: String(scoutTier) as "normal" | "elite" | "legend", generation_status: "draft" }).select().single();
    if (cardError) throw cardError;
    const { data: job, error: jobError } = await supabase.from("card_generation_jobs").insert({ user_id: user.id, card_id: card.id, source_image_path: path, status: "queued", provider: `gemini:${String(scoutTier)}` }).select().single();
    if (jobError) throw jobError;
    return NextResponse.json({ card, job }, { status: 201 });
  } catch (error) {
    console.error("card upload failed", error);
    const detail = error instanceof Error ? error.message.toLowerCase() : "";
    const errorMessage = detail.includes("missing environment") ? "Supabase接続設定がありません" : detail.includes("bucket") || detail.includes("storage") ? "Supabase Storageの設定を確認してください" : detail.includes("profile") || detail.includes("foreign key") ? "Supabaseのプロフィール設定を確認してください" : "画像の保存に失敗しました";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
