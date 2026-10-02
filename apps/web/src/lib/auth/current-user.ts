import { auth } from "@/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CurrentUser = { id: string; email: string; name?: string | null; image?: string | null };

export async function requireCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  const email = session.user.email.trim().toLowerCase();
  if (session.user.id && uuidPattern.test(session.user.id)) return { id: session.user.id, email, name: session.user.name, image: session.user.image };

  const admin = createSupabaseAdminClient();
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  const existing = users.data.users.find((user) => user.email?.toLowerCase() === email);
  if (existing) return { id: existing.id, email, name: session.user.name, image: session.user.image };

  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: session.user.name, avatar_url: session.user.image } });
  if (created.error || !created.data.user) throw created.error ?? new Error("Unable to create Supabase user mapping");
  return { id: created.data.user.id, email, name: session.user.name, image: session.user.image };
}
