import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGeminiApiKey } from "@/lib/env";
import type { Json } from "@/lib/supabase/database.types";

const model = "gemini-2.0-flash";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GeneratedCard = {
  title: string;
  description: string;
  hp: number;
  atk: number;
  shield: number;
  speed: number;
  weight_ratio: string;
  skills: Array<{ slot: number; name: string; skill_type: "active" | "passive"; power: number; cost: number; program_flow: Json[] }>;
  program_flow: Json[];
};

function parseJson(text: string): GeneratedCard {
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim()) as GeneratedCard;
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!uuidPattern.test(userId)) return NextResponse.json({ error: "Supabase user mapping is required" }, { status: 409 });

  const body = await request.json() as { jobId?: string; cardId?: string };
  if (!body.jobId || !body.cardId) return NextResponse.json({ error: "jobId and cardId are required" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data: job, error: jobError } = await supabase.from("card_generation_jobs").select("*").eq("id", body.jobId).eq("user_id", userId).single();
  if (jobError || !job) return NextResponse.json({ error: "Generation job not found" }, { status: 404 });
  const { data: card, error: cardError } = await supabase.from("cards").select("*").eq("id", body.cardId).eq("owner_id", userId).single();
  if (cardError || !card?.source_image_path) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  try {
    await supabase.from("card_generation_jobs").update({ status: "processing", attempt_count: (job.attempt_count ?? 0) + 1, started_at: new Date().toISOString(), error_message: null }).eq("id", job.id);
    await supabase.from("cards").update({ generation_status: "processing" }).eq("id", card.id);
    const image = await supabase.storage.from("card-images").download(card.source_image_path);
    if (image.error) throw image.error;
    const base64 = Buffer.from(await image.data.arrayBuffer()).toString("base64");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getGeminiApiKey()}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: image.data.type || "image/png", data: base64 } }, { text: "LLLカード用に画像を解析し、JSONのみで返してください。title, description, hp, atk, shield, speed, weight_ratio, skills(最大3件: slot,name,skill_type,power,cost,program_flow), program_flowを含めてください。数値は0以上、skill powerは0〜200、costは50固定。" }] }] }),
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no content");
    const generated = parseJson(text);
    const skills = (generated.skills ?? []).slice(0, 3).map((skill, index) => ({ ...skill, slot: index + 1, power: Math.max(0, Math.min(200, Number(skill.power) || 0)), cost: 50 }));
    const { data: updatedCard, error: updateError } = await supabase.from("cards").update({ title: String(generated.title || "Generated Card").slice(0, 120), description: String(generated.description || "").slice(0, 1000), hp: Math.max(0, Number(generated.hp) || 0), atk: Math.max(0, Number(generated.atk) || 0), shield: Math.max(0, Number(generated.shield) || 0), speed: Math.max(0, Number(generated.speed) || 0), weight_ratio: generated.weight_ratio || "1:1:1:1", skills, program_flow: generated.program_flow ?? [], generation_status: "ready" }).eq("id", card.id).eq("owner_id", userId).select().single();
    if (updateError) throw updateError;
    await supabase.from("card_skills").delete().eq("card_id", card.id);
    if (skills.length) await supabase.from("card_skills").insert(skills.map((skill) => ({ ...skill, card_id: card.id })));
    await supabase.from("card_generation_jobs").update({ status: "succeeded", finished_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ card: updatedCard, status: "succeeded" });
  } catch (error) {
    await supabase.from("card_generation_jobs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: error instanceof Error ? error.message.slice(0, 500) : "Generation failed" }).eq("id", job.id);
    await supabase.from("cards").update({ generation_status: "failed" }).eq("id", card.id);
    return NextResponse.json({ error: "Card generation failed" }, { status: 500 });
  }
}
