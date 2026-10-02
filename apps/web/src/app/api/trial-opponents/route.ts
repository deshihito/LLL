import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const url = new URL(request.url);
    const pageValue = Number.parseInt(url.searchParams.get("page") ?? "0", 10);
    const page = Number.isSafeInteger(pageValue) ? Math.max(0, Math.min(10000, pageValue)) : 0;
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 60).replace(/[\\%_]/g, " ");
    const pageSize = 24;
    let builder = createSupabaseAdminClient()
      .from("cards")
      .select("id,title,description,card_type,hp,atk,shield,speed,scout_tier,created_at,skills", { count: "exact" })
      .eq("trial_public", true)
      .eq("card_type", "action")
      .eq("generation_status", "ready")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    if (query) builder = builder.ilike("title", `%${query}%`);
    const { data, count, error } = await builder.range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    // Explicit projection: owner_id, image paths, support definitions, and private metadata are never returned.
    const cards = (data ?? []).map((card) => ({
      id: card.id, title: card.title, description: card.description, card_type: card.card_type,
      hp: card.hp, atk: card.atk, shield: card.shield, speed: card.speed,
      scout_tier: card.scout_tier, created_at: card.created_at, skills: card.skills,
      imageSrc: `/api/trial-opponents/${encodeURIComponent(card.id)}/image`,
    }));
    return NextResponse.json({ cards, page, pageSize, total: count ?? 0, hasMore: page * pageSize + cards.length < (count ?? 0) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("trial opponent list failed", error);
    return fail(500, "試し切り相手を読み込めませんでした");
  }
}
