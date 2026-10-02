import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
async function ownedDeck(deckId: string, userId: string) { const admin = createSupabaseAdminClient(); const { data, error } = await admin.from("decks").select("id").eq("id", deckId).eq("owner_id", userId).maybeSingle(); if (error) throw error; return { admin, deck: data }; }

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です");
    const { id: deckId } = await params; const body = await request.json().catch(() => ({}));
    const cardIds: string[] = Array.isArray(body.cardIds) ? Array.from(new Set<string>(body.cardIds.filter((id: unknown): id is string => typeof id === "string"))) : [];
    if (cardIds.length > 20) return fail(409, "デッキは20枚までです");
    const { admin, deck } = await ownedDeck(deckId, user.id); if (!deck) return fail(404, "データが見つかりません");
    const { data: cards, error: cardsError } = cardIds.length ? await admin.from("cards").select("id,card_type,parent_card_id,generation_status").eq("owner_id", user.id).in("id", cardIds) : { data: [], error: null };
    if (cardsError) throw cardsError;
    if ((cards ?? []).length !== cardIds.length || (cards ?? []).some((card) => card.generation_status !== "ready")) return fail(400, "生成済みカードだけをデッキへ追加できます");
    const actionIds = (cards ?? []).filter((card) => card.card_type === "action").map((card) => card.id);
    const { data: parts, error: partsError } = actionIds.length ? await admin.from("cards").select("id,card_type,parent_card_id,generation_status").eq("owner_id", user.id).eq("card_type", "part").in("parent_card_id", actionIds).eq("generation_status", "ready") : { data: [], error: null };
    if (partsError) throw partsError;
    const expandedIds = [...new Set([...cardIds, ...(parts ?? []).map((part) => part.id)])];
    if (expandedIds.length > 20) return fail(409, "パーツを含めたデッキは20枚までです");
    const allCards = [...(cards ?? []), ...(parts ?? [])];
    const { error: deleteError } = await admin.from("deck_cards").delete().eq("deck_id", deckId); if (deleteError) throw deleteError;
    if (!expandedIds.length) return NextResponse.json({ cards: [] });
    const rows = expandedIds.map((cardId, index) => ({ deck_id: deckId, card_id: cardId, slot_index: index + 1, role: allCards.find((card) => card.id === cardId)?.card_type ?? "action" }));
    const { data, error } = await admin.from("deck_cards").insert(rows).select("id,card_id,slot_index,role,created_at").order("slot_index", { ascending: true }); if (error) throw error;
    return NextResponse.json({ cards: data ?? [] });
  } catch (error) { console.error("deck cards bulk save failed", error); return fail(500, "保存に失敗しました"); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(); if (!user) return fail(401, "ログインが必要です"); const { id: deckId } = await params; const body = await request.json().catch(() => ({})); const cardId = typeof body.cardId === "string" ? body.cardId : ""; if (!cardId) return fail(400, "入力内容を確認してください");
    const { admin, deck } = await ownedDeck(deckId, user.id); if (!deck) return fail(404, "データが見つかりません"); const { data: card, error: cardError } = await admin.from("cards").select("id,card_type,generation_status").eq("id", cardId).eq("owner_id", user.id).maybeSingle(); if (cardError) throw cardError; if (!card || card.generation_status !== "ready") return fail(400, "生成済みカードだけを追加できます");
    const { data: current, error: listError } = await admin.from("deck_cards").select("id,card_id,slot_index").eq("deck_id", deckId).order("slot_index", { ascending: true }); if (listError) throw listError; if ((current ?? []).length >= 20 || (current ?? []).some((row) => row.card_id === cardId)) return fail(409, "デッキの制約により追加できません");
    const { data, error } = await admin.from("deck_cards").insert({ deck_id: deckId, card_id: cardId, role: card.card_type, slot_index: (current?.length ?? 0) + 1 }).select("id,card_id,slot_index,role,created_at").single(); if (error) throw error; return NextResponse.json({ card: data }, { status: 201 });
  } catch (error) { console.error("deck card add failed", error); return fail(500, "保存に失敗しました"); }
}
