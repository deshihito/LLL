import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey, getSupabaseUrl } from "@/lib/env";
import type { Database } from "./database.types";

export function createSupabaseAdminClient() {
  return createClient<Database>(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
