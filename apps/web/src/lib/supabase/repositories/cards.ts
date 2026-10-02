import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Client = SupabaseClient<Database>;

export async function listOwnedCards(client: Client) {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return [];

  const { data, error } = await client
    .from("cards")
    .select("*")
    .eq("owner_id", userData.user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createDraftCard(client: Client, input: Database["public"]["Tables"]["cards"]["Insert"]) {
  const { data, error } = await client.from("cards").insert({ ...input, generation_status: "draft" }).select().single();
  if (error) throw error;
  return data;
}
