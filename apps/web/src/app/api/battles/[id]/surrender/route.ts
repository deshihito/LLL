/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    if (!user) return fail(401, "ログインが必要です");
    const { id } = await params;
    const { data, error } = await (createSupabaseAdminClient() as any).rpc("surrender_battle", {
      p_battle_id: id,
      p_player_id: user.id,
    });
    if (error) return fail(400, "対戦を終了できませんでした");
    return NextResponse.json({ result: data });
  } catch {
    return fail(500, "対戦を終了できませんでした");
  }
}
