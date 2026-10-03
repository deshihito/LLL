import { auth } from "@/auth";

type CurrentUser = { id: string; email: string; name?: string | null; image?: string | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requireCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  const email = session?.user?.email?.trim().toLowerCase();
  if (!id || !UUID_PATTERN.test(id) || !email) return null;
  return { id, email, name: session.user.name, image: session.user.image };
}
