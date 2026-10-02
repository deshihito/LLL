import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getGeminiApiKeys } from "@/lib/env";
import type { Json } from "@/lib/supabase/database.types";
import { normalizeSkill, validateSkill, type GeneratedSkill } from "@/lib/cards/skill-schema";

const model = "gemini-3.1-flash-lite";
const MAX_ATTEMPTS = 3;
const JOB_TIMEOUT_MS = 45_000;
type GenerationErrorCode = "SUPABASE_STORAGE_ERROR" | "GEMINI_CONFIG_ERROR" | "GEMINI_REQUEST_ERROR" | "GEMINI_RESPONSE_ERROR" | "SUPABASE_CARD_ERROR" | "SUPABASE_JOB_ERROR";
class GenerationError extends Error {
  constructor(public readonly code: GenerationErrorCode) {
    super(code);
  }
}

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
type ScoutTier = "normal" | "elite" | "legend";

function parseJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Invalid card JSON");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function parseGeneratedCard(text: string, scoutTier: ScoutTier): GeneratedCard {
  const value = parseJson(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid card JSON");
  const card = value as Record<string, unknown>;
  if (typeof card.title !== "string" || typeof card.description !== "string" || !Array.isArray(card.skills) || card.skills.length < 1 || card.skills.length > 3) throw new Error("Invalid card fields");
  const invalidSkillIndex = card.skills.findIndex((skill) => !validateSkill(skill));
  if (invalidSkillIndex >= 0) {
    const invalidSkill = card.skills[invalidSkillIndex];
    const skillType = invalidSkill && typeof invalidSkill === "object" && !Array.isArray(invalidSkill) && "skill_type" in invalidSkill && typeof invalidSkill.skill_type === "string" ? ` (${invalidSkill.skill_type})` : "";
    throw new Error(`Invalid skill schema at skill ${invalidSkillIndex + 1}${skillType}`);
  }
  const rawStats = ["hp", "atk", "shield", "speed"].map((field) => typeof card[field] === "number" && Number.isFinite(card[field]) ? Math.max(1, Math.min(200, Math.round(card[field] as number))) : 1);
  const normal = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, Math.random()))) * Math.cos(Math.PI * 2 * Math.random());
  const tierRule = { normal: { mean: 300, minimum: 100 }, elite: { mean: 360, minimum: 260 }, legend: { mean: 420, minimum: 380 } }[scoutTier];
  const targetTotal = Math.max(tierRule.minimum, Math.min(500, Math.round(tierRule.mean + normal * 60)));
  const sum = rawStats.reduce((total, value) => total + value, 0);
  const stats = rawStats.map((value) => Math.max(1, Math.min(200, Math.round(value * targetTotal / sum))));
  let difference = targetTotal - stats.reduce((total, value) => total + value, 0);
  for (let index = 0; difference !== 0 && index < 1000; index += 1) {
    const slot = index % stats.length;
    if (difference > 0 && stats[slot] < 200) { stats[slot] += 1; difference -= 1; }
    else if (difference < 0 && stats[slot] > 1) { stats[slot] -= 1; difference += 1; }
  }
  return {
    title: card.title.trim().slice(0, 120), description: card.description.trim().slice(0, 1000), hp: stats[0], atk: stats[1], shield: stats[2], speed: stats[3], weight_ratio: typeof card.weight_ratio === "string" ? card.weight_ratio : "1:1:1:1",
    skills: card.skills.map((skill) => normalizeSkill(skill as GeneratedSkill)), program_flow: Array.isArray(card.program_flow) ? card.program_flow as Json[] : [],
  };
}

const generationPrompt = `LLLカード用に画像を解析し、JSONのみで返してください。次の形式を厳守してください。
{"title":"string","description":"string","hp":0,"atk":0,"shield":0,"speed":0,"weight_ratio":"1:1:1:1","program_flow":[],"skills":[{"name":"string","description":"string","skill_type":"active","cost":50,"turn_behavior":"end","conditions":{"all":[{"type":"always"}]},"effects":[{"type":"damage","target":"enemy_front","value":50}]}]}
必須ルール: title/description/skills.name/skills.descriptionは画面表示用の自然で読みやすい日本語にする。英語の説明文、ローマ字だけの文章、技術用語の羅列は禁止。ただしprogram_flow、conditions、effects、およびそれらの固定enum値はAIが組む内部プログラムなので、英語のままでよく、指定された英字enumを厳守する。skillsは1〜3件、各skillにname/description/skill_type/cost/turn_behavior/conditions/effectsを必ず含める。turn_behaviorはendかcontinue。continueの技は1ターン最大2回まで使用可能。effectsは各技1〜6件。activeのcostは必ず50、passiveのcostは必ず0。conditionsはall/any/notの条件ツリーで深度3・ノード12以下。すべてのeffectにtargetを必ず含める。damage/heal/ap_change/shield_changeはvalueを必ず含める。stat_modifierはstatと整数valueとduration(1〜5)を必ず含める。status_applyはkeyとvalue(10〜200)とduration(1〜5)を必ず含める。status_applyのvalueはstunでは使用せず、burnは基礎威力、guard_breakはDEF低下率、overdriveはATK加算値として扱う。status_removeはkeyを必ず含める。counterはtrigger=on_damage_taken、value、duration(1〜5)を必ず含め、follow_upはtrigger=on_hitとvalueを必ず含める。passive skillのconditionsには必ずon_turn_start/on_turn_end/on_attack/on_hit/on_damage_takenのいずれかを含め、alwaysだけにしない。対象はself,ally_front,ally_support,all_allies,enemy_front,enemy_support,all_enemies,random_enemy。条件typeはalways,on_turn_start,on_turn_end,on_attack,on_hit,on_damage_taken,hp_below,hp_above,ap_at_least,shield_broken,part_equipped,status_present,status_absent,turn_at_least。効果typeはdamage,heal,stat_modifier,ap_change,shield_change,status_apply,status_remove,equip_part,unequip_part,counter,follow_up。status keyはstun,burn,guard_break,overdrive。statはmax_hp,atk,shield,speed。数値は整数。内部構造をユーザー向けの説明文に展開せず、JSONの構造としてのみ返す。説明文以外のMarkdownは禁止。`;

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const userId = user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { jobId?: string; cardId?: string };
  if (!body.jobId || !body.cardId) return NextResponse.json({ error: "jobId and cardId are required" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  await supabase.from("card_generation_jobs").update({ status: "queued", started_at: null }).eq("id", body.jobId).eq("user_id", userId).eq("status", "processing").lt("started_at", new Date(Date.now() - JOB_TIMEOUT_MS).toISOString()).lt("attempt_count", MAX_ATTEMPTS);
  const { data: job, error: jobError } = await supabase.from("card_generation_jobs").select("*").eq("id", body.jobId).eq("user_id", userId).single();
  if (jobError || !job) return NextResponse.json({ error: "Generation job not found" }, { status: 404 });
  const { data: card, error: cardError } = await supabase.from("cards").select("*").eq("id", body.cardId).eq("owner_id", userId).single();
  if (cardError || !card?.source_image_path) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const providerTier = typeof job.provider === "string" ? job.provider.split(":").pop() : "normal";
  const scoutTier: ScoutTier = providerTier === "elite" || providerTier === "legend" ? providerTier : "normal";
  if ((job.attempt_count ?? 0) >= MAX_ATTEMPTS && job.status !== "succeeded") return NextResponse.json({ error: "再試行回数の上限に達しました。新しいスカウトを開始してください。" }, { status: 429 });
  if (job.card_id !== card.id || job.source_image_path !== card.source_image_path) return NextResponse.json({ error: "生成対象が一致しません" }, { status: 409 });
  if (job.status === "succeeded" && card.generation_status === "ready") return NextResponse.json({ card, status: "succeeded" });
  if (job.status === "processing") return NextResponse.json({ error: "このカードは現在解析中です" }, { status: 409 });

  let stage: "claim" | "image" | "gemini" | "response" | "card" | "skills" | "job" = "claim";
  try {
    const { data: claimedJob, error: claimError } = await supabase.from("card_generation_jobs").update({ status: "processing", attempt_count: (job.attempt_count ?? 0) + 1, started_at: new Date().toISOString(), finished_at: null, error_message: null }).eq("id", job.id).in("status", ["queued", "failed"]).select("id").maybeSingle();
    if (claimError) throw new GenerationError("SUPABASE_JOB_ERROR");
    if (!claimedJob) return NextResponse.json({ error: "このカードはすでに処理されています" }, { status: 409 });
    stage = "image";
    const { error: processingError } = await supabase.from("cards").update({ generation_status: "processing" }).eq("id", card.id).eq("owner_id", userId);
    if (processingError) throw new GenerationError("SUPABASE_CARD_ERROR");
    const image = await supabase.storage.from("card-images").download(card.source_image_path);
    if (image.error) throw new GenerationError("SUPABASE_STORAGE_ERROR");
    const base64 = Buffer.from(await image.data.arrayBuffer()).toString("base64");
    const scoutInstruction = `このカードは${scoutTier === "normal" ? "ノーマル" : scoutTier === "elite" ? "エリート" : "レジェンド"}スカウトです。ステータス総合値はノーマル100以上、エリート260以上、レジェンド380以上を目安にし、ただし各値は200以下にしてください。`;
    const requestBody = JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: image.data.type || "image/png", data: base64 } }, { text: `${generationPrompt}\n${scoutInstruction}` }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } });
    stage = "gemini";
    let responseText = "";
    let responseStatus = 500;
    let apiKeys: string[];
    try { apiKeys = getGeminiApiKeys(); } catch { throw new GenerationError("GEMINI_CONFIG_ERROR"); }
    for (const apiKey of apiKeys) {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);
      let response: Response;
      try { response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, body: requestBody, signal: controller.signal }); } catch (error) { if (error instanceof Error && error.name === "AbortError") throw new GenerationError("GEMINI_REQUEST_ERROR"); throw error; } finally { clearTimeout(timeout); }
      responseText = await response.text();
      responseStatus = response.status;
      if (response.ok) break;
      if (![401, 403, 429, 500, 502, 503].includes(response.status)) break;
    }
    if (responseStatus < 200 || responseStatus >= 300) throw new GenerationError("GEMINI_REQUEST_ERROR");
    stage = "response";
    type GeminiPayload = { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>; promptFeedback?: { blockReason?: string } };
    let payload: GeminiPayload;
    try { payload = JSON.parse(responseText) as GeminiPayload; } catch { console.error("gemini response was not JSON", { responseStatus, responseBytes: Buffer.byteLength(responseText) }); throw new GenerationError("GEMINI_RESPONSE_ERROR"); }
    const candidate = payload.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text).filter((part): part is string => Boolean(part)).join("\n").trim();
    if (!text) {
      const finishReason = typeof candidate?.finishReason === "string" ? candidate.finishReason : "unknown";
      const blockReason = payload.promptFeedback?.blockReason ?? "none";
      console.error("gemini response had no text", { responseStatus, finishReason, blockReason, candidates: payload.candidates?.length ?? 0 });
      throw new GenerationError("GEMINI_RESPONSE_ERROR");
    }
    let generated: GeneratedCard;
    try { generated = parseGeneratedCard(text, scoutTier); } catch (error) { console.error("gemini response failed card validation", { responseStatus, responseBytes: Buffer.byteLength(text), reason: error instanceof Error ? error.message : "unknown" }); throw new GenerationError("GEMINI_RESPONSE_ERROR"); }
    const cardSkills = generated.skills.map((skill, index) => { const damageEffect = skill.effects.find((effect) => effect.type === "damage"); return { card_id: card.id, slot: index + 1, name: skill.name, description: skill.description, skill_type: skill.skill_type, power: damageEffect && "value" in damageEffect ? damageEffect.value : 0, cost: skill.cost, program_flow: [], conditions: skill.conditions as Json, effects: skill.effects as Json, schema_version: 1 }; });
    stage = "card";
    const { error: updateError } = await supabase.from("cards").update({ title: generated.title, description: generated.description, hp: generated.hp, atk: generated.atk, shield: generated.shield, speed: generated.speed, weight_ratio: generated.weight_ratio, skills: generated.skills as Json, program_flow: generated.program_flow }).eq("id", card.id).eq("owner_id", userId).eq("generation_status", "processing");
    if (updateError) throw new GenerationError("SUPABASE_CARD_ERROR");
    stage = "skills";
    await supabase.from("card_skills").delete().eq("card_id", card.id);
    const { error: skillError } = await supabase.from("card_skills").insert(cardSkills);
    if (skillError) throw new GenerationError("SUPABASE_CARD_ERROR");
    const { data: updatedCard, error: readyError } = await supabase.from("cards").update({ generation_status: "ready" }).eq("id", card.id).eq("owner_id", userId).eq("generation_status", "processing").select().single();
    if (readyError || !updatedCard) throw new GenerationError("SUPABASE_CARD_ERROR");
    stage = "job";
    const { error: finishedError } = await supabase.from("card_generation_jobs").update({ status: "succeeded", finished_at: new Date().toISOString() }).eq("id", job.id).eq("status", "processing");
    if (finishedError) throw new GenerationError("SUPABASE_JOB_ERROR");
    return NextResponse.json({ card: updatedCard, status: "succeeded" });
  } catch (error) {
    const code = error instanceof GenerationError ? error.code : stage === "image" ? "SUPABASE_STORAGE_ERROR" : stage === "gemini" ? "GEMINI_REQUEST_ERROR" : stage === "response" ? "GEMINI_RESPONSE_ERROR" : stage === "card" || stage === "skills" ? "SUPABASE_CARD_ERROR" : "SUPABASE_JOB_ERROR";
    console.error("generate-card failed", { code, stage });
    const nextAttempt = (job.attempt_count ?? 0) + 1;
    await supabase.from("card_generation_jobs").update({ status: nextAttempt < MAX_ATTEMPTS ? "queued" : "failed", finished_at: nextAttempt < MAX_ATTEMPTS ? null : new Date().toISOString(), error_message: code }).eq("id", job.id).eq("status", "processing");
    await supabase.from("cards").update({ generation_status: nextAttempt < MAX_ATTEMPTS ? "draft" : "failed" }).eq("id", card.id).eq("owner_id", userId).eq("generation_status", "processing");
    const messages: Record<GenerationErrorCode, string> = { SUPABASE_STORAGE_ERROR: "画像を取得できませんでした。画像を選び直してもう一度お試しください。", GEMINI_CONFIG_ERROR: "解析サービスの設定を確認できませんでした。", GEMINI_REQUEST_ERROR: "カードの解析サービスに接続できませんでした。時間をおいてもう一度お試しください。", GEMINI_RESPONSE_ERROR: "画像の解析結果を確認できませんでした。もう一度お試しください。", SUPABASE_CARD_ERROR: "カードを保存できませんでした。しばらくしてから再試行してください。", SUPABASE_JOB_ERROR: "生成処理の状態を更新できませんでした。もう一度お試しください。" };
    return NextResponse.json({ error: messages[code] }, { status: 500 });
  }
}
