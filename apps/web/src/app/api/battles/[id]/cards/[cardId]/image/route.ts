/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; cardId: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id: battleId, cardId } = await params;
    const admin = createSupabaseAdminClient() as any;
    const { data: participant, error: participantError } = await admin.from("battle_players").select("battle_id").eq("battle_id", battleId).eq("player_id", user.id).maybeSingle();
    if (participantError || !participant) return new NextResponse("Not found", { status: 404 });
    const { data: snapshot, error: snapshotError } = await admin.from("battle_cards").select("source_card_id").eq("battle_id", battleId).eq("id", cardId).maybeSingle();
    if (snapshotError || !snapshot?.source_card_id) return new NextResponse("Not found", { status: 404 });
    const { data: card, error: cardError } = await admin.from("cards").select("source_image_path").eq("id", snapshot.source_card_id).maybeSingle();
    if (cardError || !card?.source_image_path) return new NextResponse("Not found", { status: 404 });
    const { data: image, error: imageError } = await admin.storage.from("card-images").download(card.source_image_path);
    if (imageError || !image) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(image, { headers: { "Content-Type": image.type || "image/png", "Cache-Control": "private, no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
