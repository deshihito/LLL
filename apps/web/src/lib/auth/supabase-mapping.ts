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

async function findByEmail(admin: ReturnType<typeof createSupabaseAdminClient>, email: string) {
  const perPage = 100;
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage });
    if (result.error) throw result.error;
    const found = result.data.users.find((user) => normalizedEmail(user.email ?? "") === email);
    if (found || result.data.users.length < perPage) return found;
  }
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
    let mapped = await findByEmail(admin, key);
    if (!mapped) {
      const created = await admin.auth.admin.createUser({
        email: key,
        email_confirm: true,
        user_metadata: { name, avatar_url: image },
      });
      if (created.data.user) {
        mapped = created.data.user;
      } else {
        // Another application instance may have created the user concurrently.
        mapped = await findByEmail(admin, key);
        if (!mapped) throw created.error ?? new Error("Unable to create Supabase user mapping");
      }
    }
    // profiles is created by the auth.users trigger. Do not upsert it on login.
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
