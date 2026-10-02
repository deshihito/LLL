import { auth } from "@/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CurrentUser = { id: string; email: string; name?: string | null; image?: string | null };

async function ensureProfile(admin: ReturnType<typeof createSupabaseAdminClient>, id: string, email: string, name?: string | null, image?: string | null) {
  const username = (name?.trim() || email.split("@")[0] || "Player").slice(0, 80);
  const { error } = await admin.from("profiles").upsert({ id, username, avatar_url: image ?? null }, { onConflict: "id" });
  if (error) throw error;
}

export async function requireCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  const email = session.user.email.trim().toLowerCase();
  const admin = createSupabaseAdminClient();
  if (session.user.id && uuidPattern.test(session.user.id)) {
    await ensureProfile(admin, session.user.id, email, session.user.name, session.user.image);
    return { id: session.user.id, email, name: session.user.name, image: session.user.image };
  }

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  let mapped = users.data.users.find((user) => user.email?.toLowerCase() === email);
  if (!mapped) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: session.user.name, avatar_url: session.user.image } });
    if (created.error || !created.data.user) throw created.error ?? new Error("Unable to create Supabase user mapping");
    mapped = created.data.user;
  }
  await ensureProfile(admin, mapped.id, email, session.user.name, session.user.image);
  return { id: mapped.id, email, name: session.user.name, image: session.user.image };
}
