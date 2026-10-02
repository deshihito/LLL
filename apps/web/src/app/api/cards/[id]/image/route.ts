import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(); if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const { id } = await params; const admin = createSupabaseAdminClient();
    const { data: card, error } = await admin.from("cards").select("source_image_path").eq("id", id).eq("owner_id", user.id).maybeSingle(); if (error) throw error; if (!card?.source_image_path) return new NextResponse("Not found", { status: 404 });
    const image = await admin.storage.from("card-images").download(card.source_image_path); if (image.error) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(image.data, { headers: { "Content-Type": image.data.type || "image/png", "Cache-Control": "private, max-age=3600" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
