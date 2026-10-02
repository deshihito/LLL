import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getGeminiApiKeys } from "@/lib/env";
import type { Json } from "@/lib/supabase/database.types";
import { normalizeSkill, validateSkill, type GeneratedSkill } from "@/lib/cards/skill-schema";

const model = "gemini-3.1-flash-lite";
type GeneratedCard = {
  title: string;
  description: string;
  hp: number;
  atk: number;
  shield: number;
  speed: number;
  weight_ratio: string;
  skills: GeneratedSkill[];
  program_flow: Json[];
};

function parseJson(text: string): unknown {
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
}

function parseGeneratedCard(text: string): GeneratedCard {
  const value = parseJson(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid card JSON");
  const card = value as Record<string, unknown>;
  if (typeof card.title !== "string" || typeof card.description !== "string" || !Array.isArray(card.skills) || card.skills.length < 1 || card.skills.length > 3) throw new Error("Invalid card fields");
  if (!card.skills.every(validateSkill)) throw new Error("Invalid skill schema");
  const number = (field: string) => typeof card[field] === "number" && Number.isFinite(card[field]) ? Math.max(0, Math.min(100000, Math.round(card[field] as number))) : 0;
  return {
    title: card.title.trim().slice(0, 120), description: card.description.trim().slice(0, 1000), hp: number("hp"), atk: number("atk"), shield: number("shield"), speed: number("speed"), weight_ratio: typeof card.weight_ratio === "string" ? card.weight_ratio : "1:1:1:1",
    skills: card.skills.map((skill) => normalizeSkill(skill as GeneratedSkill)), program_flow: Array.isArray(card.program_flow) ? card.program_flow as Json[] : [],
  };
}

const generationPrompt = `LLLカード用に画像を解析し、JSONのみで返してください。次の形式を厳守してください。
{"title":"string","description":"string","hp":0,"atk":0,"shield":0,"speed":0,"weight_ratio":"1:1:1:1","program_flow":[],"skills":[{"name":"string","description":"string","skill_type":"active|passive","cost":50,"conditions":{"all":[{"type":"always"}]},"effects":[{"type":"damage","target":"enemy_front","value":50}]}]}
ルール: skillsは1〜3件、effectsは各技1〜6件。activeのcostは50固定、passiveのcostは0固定。conditionsはall/any/notの条件ツリーで深度3・ノード12以下。対象はself,ally_front,ally_support,all_allies,enemy_front,enemy_support,all_enemies,random_enemy。条件typeはalways,on_turn_start,on_turn_end,on_attack,on_hit,on_damage_taken,hp_below,hp_above,ap_at_least,shield_broken,part_equipped,status_present,status_absent,turn_at_least。効果typeはdamage,heal,stat_modifier,ap_change,shield_change,status_apply,status_remove,equip_part,unequip_part,counter,follow_up。status keyはstun,burn,guard_break,overdrive。statはmax_hp,atk,shield,speed。counterのtriggerはon_damage_taken、follow_upのtriggerはon_hit。数値は整数。説明文以外のMarkdownは禁止。`;

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const userId = user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const requestBody = JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: image.data.type || "image/png", data: base64 } }, { text: generationPrompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } });
    let responseText = "";
    let responseStatus = 500;
    for (const apiKey of getGeminiApiKeys()) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, body: requestBody });
      responseText = await response.text();
      responseStatus = response.status;
      if (response.ok) break;
      if (![401, 403, 429, 500, 502, 503].includes(response.status)) break;
    }
    if (responseStatus < 200 || responseStatus >= 300) throw new Error(`Gemini request failed: ${responseStatus} ${responseText.slice(0, 300)}`);
    const payload = JSON.parse(responseText) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no content");
    const generated = parseGeneratedCard(text);
    const cardSkills = generated.skills.map((skill, index) => { const damageEffect = skill.effects.find((effect) => effect.type === "damage"); return { card_id: card.id, slot: index + 1, name: skill.name, description: skill.description, skill_type: skill.skill_type, power: damageEffect && "value" in damageEffect ? damageEffect.value : 0, cost: skill.cost, program_flow: [], conditions: skill.conditions as Json, effects: skill.effects as Json, schema_version: 1 }; });
    const { data: updatedCard, error: updateError } = await supabase.from("cards").update({ title: generated.title, description: generated.description, hp: generated.hp, atk: generated.atk, shield: generated.shield, speed: generated.speed, weight_ratio: generated.weight_ratio, skills: generated.skills as Json, program_flow: generated.program_flow, generation_status: "ready" }).eq("id", card.id).eq("owner_id", userId).select().single();
    if (updateError) throw updateError;
    await supabase.from("card_skills").delete().eq("card_id", card.id);
    const { error: skillError } = await supabase.from("card_skills").insert(cardSkills);
    if (skillError) throw skillError;
    await supabase.from("card_generation_jobs").update({ status: "succeeded", finished_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ card: updatedCard, status: "succeeded" });
  } catch (error) {
    console.error("generate-card failed", error);
    await supabase.from("card_generation_jobs").update({ status: "failed", finished_at: new Date().toISOString(), error_message: error instanceof Error ? error.message.slice(0, 500) : "Generation failed" }).eq("id", job.id);
    await supabase.from("cards").update({ generation_status: "failed" }).eq("id", card.id);
    const message = error instanceof Error && error.message.startsWith("Gemini request failed") ? "Gemini APIへの接続に失敗しました。モデル名またはAPIキーを確認してください" : "画像解析結果の形式を検証できませんでした。もう一度お試しください";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
