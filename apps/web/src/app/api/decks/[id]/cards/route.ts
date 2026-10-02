import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { DeckSelectionError, expandDeckCardIds, type DeckCardCandidate } from "@/lib/decks/normalize";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const selectionMessages: Record<string, string> = {
  TOO_MANY_REQUESTED: "選択カードは20枚までです",
  CARD_NOT_OWNED: "自分が所有するカードだけを選択してください",
  CARD_NOT_READY: "生成済みカードだけをデッキへ追加できます",
  PART_SELECTION_FORBIDDEN: "パーツは単独で選択できません。親アクションカードと一緒に自動編成されます",
  UNSUPPORTED_CARD_TYPE: "このカード種別はデッキに追加できません",
  ACTION_LIMIT: "アクションカードは5枚までです",
  DECK_LIMIT: "パーツを含めたデッキは20枚までです",
};

async function ownedDeck(deckId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("decks").select("id").eq("id", deckId).eq("owner_id", userId).maybeSingle();
  if (error) throw error;
  return { admin, deck: data };
}

async function validateAndSave(admin: ReturnType<typeof createSupabaseAdminClient>, deckId: string, userId: string, requestedIds: string[]) {
  const { data: selected, error: selectedError } = requestedIds.length
    ? await admin.from("cards").select("id,card_type,parent_card_id,generation_status,created_at").eq("owner_id", userId).in("id", requestedIds)
    : { data: [], error: null };
  if (selectedError) throw selectedError;
  const actionIds = (selected ?? []).filter((card) => card.card_type === "action").map((card) => card.id);
  const { data: parts, error: partsError } = actionIds.length
    ? await admin.from("cards").select("id,card_type,parent_card_id,generation_status,created_at").eq("owner_id", userId).eq("card_type", "part").in("parent_card_id", actionIds).eq("generation_status", "ready").order("created_at", { ascending: true }).order("id", { ascending: true })
    : { data: [], error: null };
  if (partsError) throw partsError;
  const catalog = [...(selected ?? []), ...(parts ?? [])] as DeckCardCandidate[];
  let expandedIds: string[];
  try { expandedIds = expandDeckCardIds(requestedIds, catalog); }
  catch (error) {
    if (error instanceof DeckSelectionError) return { error: selectionMessages[error.code] ?? "デッキの内容を確認してください", status: error.code === "ACTION_LIMIT" || error.code === "DECK_LIMIT" || error.code === "TOO_MANY_REQUESTED" ? 409 : 400 } as const;
    throw error;
  }
  // The RPC repeats ownership/readiness/limit checks and replaces the full list atomically.
  const { data, error } = await admin.rpc("save_deck_cards", { p_deck_id: deckId, p_player_id: userId, p_card_ids: requestedIds });
  if (error) {
    const message = error.message;
    if (message.includes("DECK_NOT_OWNED")) return { error: "デッキが見つかりません", status: 404 } as const;
    if (message.includes("PART_CARD_CANNOT_BE_SELECTED")) return { error: selectionMessages.PART_SELECTION_FORBIDDEN, status: 400 } as const;
    if (message.includes("ACTION_LIMIT")) return { error: selectionMessages.ACTION_LIMIT, status: 409 } as const;
    if (message.includes("DECK_LIMIT")) return { error: selectionMessages.DECK_LIMIT, status: 409 } as const;
    if (message.includes("CARD_NOT_READY")) return { error: selectionMessages.CARD_NOT_READY, status: 400 } as const;
    if (message.includes("CARD_NOT_OWNED")) return { error: selectionMessages.CARD_NOT_OWNED, status: 400 } as const;
    throw error;
  }
  return { cards: Array.isArray(data) ? data : [], expandedIds } as const;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const { id: deckId } = await params;
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.cardIds) || body.cardIds.some((id: unknown) => typeof id !== "string" || !uuidPattern.test(id))) return fail(400, "カード選択を確認してください");
    const requestedIds = [...new Set<string>(body.cardIds)];
    if (requestedIds.length > 20) return fail(409, selectionMessages.TOO_MANY_REQUESTED);
    const { admin, deck } = await ownedDeck(deckId, user.id);
    if (!deck) return fail(404, "データが見つかりません");
    const result = await validateAndSave(admin, deckId, user.id, requestedIds);
    if ("error" in result) return fail(result.status ?? 400, result.error ?? "保存に失敗しました");
    return NextResponse.json({ cards: result.cards, expandedCardIds: result.expandedIds });
  } catch (error) {
    console.error("deck cards atomic save failed", error);
    return fail(500, "保存に失敗しました");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const { id: deckId } = await params;
    const body = await request.json().catch(() => ({}));
    const cardId = typeof body.cardId === "string" ? body.cardId : "";
    if (!uuidPattern.test(cardId)) return fail(400, "カード選択を確認してください");
    const { admin, deck } = await ownedDeck(deckId, user.id);
    if (!deck) return fail(404, "データが見つかりません");
    const { data: current, error: currentError } = await admin.from("deck_cards").select("card_id,slot_index").eq("deck_id", deckId).order("slot_index", { ascending: true });
    if (currentError) throw currentError;
    const currentIds = (current ?? []).map((row) => row.card_id);
    const lookupIds = [...new Set([...currentIds, cardId])];
    const { data: ownedCards, error: cardsError } = lookupIds.length
      ? await admin.from("cards").select("id,card_type").eq("owner_id", user.id).in("id", lookupIds)
      : { data: [], error: null };
    if (cardsError) throw cardsError;
    if (!(ownedCards ?? []).some((card) => card.id === cardId)) return fail(400, selectionMessages.CARD_NOT_OWNED);
    const cardById = new Map((ownedCards ?? []).map((card) => [card.id, card]));
    const requestedIds = [...currentIds.filter((id) => cardById.get(id)?.card_type !== "part"), cardId];
    const result = await validateAndSave(admin, deckId, user.id, requestedIds);
    if ("error" in result) return fail(result.status ?? 400, result.error ?? "保存に失敗しました");
    return NextResponse.json({ cards: result.cards }, { status: 201 });
  } catch (error) {
    console.error("deck card add failed", error);
    return fail(500, "保存に失敗しました");
  }
}
