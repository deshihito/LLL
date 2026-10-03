import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type MappingResult = { id: string; email: string };
type CacheEntry = { id: string; expiresAt: number };

const CACHE_TTL_MS = 15 * 60 * 1000;
const emailToSupabaseId = new Map<string, CacheEntry>();
const mappingInFlight = new Map<string, Promise<MappingResult>>();

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

async function mapUser(email: string, name?: string | null, image?: string | null): Promise<MappingResult> {
  const key = normalizedEmail(email);
  const cached = emailToSupabaseId.get(key);
  if (cached && cached.expiresAt > Date.now()) return { id: cached.id, email: key };
  if (cached) emailToSupabaseId.delete(key);

  const existing = mappingInFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const admin = createSupabaseAdminClient();
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) throw users.error;
    let mapped = users.data.users.find((user) => normalizedEmail(user.email ?? "") === key);
    if (!mapped) {
      const created = await admin.auth.admin.createUser({
        email: key,
        email_confirm: true,
        user_metadata: { name, avatar_url: image },
      });
      if (created.error || !created.data.user) throw created.error ?? new Error("Unable to create Supabase user mapping");
      mapped = created.data.user;
    }
    const username = (name?.trim() || key.split("@")[0] || "Player").slice(0, 80);
    const { error } = await admin.from("profiles").upsert({ id: mapped.id, username, avatar_url: image ?? null }, { onConflict: "id" });
    if (error) throw error;
    emailToSupabaseId.set(key, { id: mapped.id, expiresAt: Date.now() + CACHE_TTL_MS });
    return { id: mapped.id, email: key };
  })();
  mappingInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    mappingInFlight.delete(key);
  }
}

export function mapNextAuthUserToSupabaseUser(input: { email: string; name?: string | null; image?: string | null }) {
  return mapUser(input.email, input.name, input.image);
}
