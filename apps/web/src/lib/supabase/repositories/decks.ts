import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Client = SupabaseClient<Database>;

export async function listOwnedDecks(client: Client) {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return [];

  const { data, error } = await client
    .from("decks")
    .select("*")
    .eq("owner_id", userData.user.id)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createDeck(client: Client, input: Database["public"]["Tables"]["decks"]["Insert"]) {
  const { data, error } = await client.from("decks").insert(input).select().single();
  if (error) throw error;
  return data;
}
