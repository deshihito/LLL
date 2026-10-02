import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServiceRoleKey } from "@/lib/env";
import type { Database } from "./database.types";

export function createSupabaseAdminClient() {
  const env = getPublicEnv();
  return createClient<Database>(env.supabaseUrl, getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
