import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import { mapNextAuthUserToSupabaseUser } from "@/lib/auth/supabase-mapping";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  redirectProxyUrl: process.env.AUTH_REDIRECT_PROXY_URL ?? "https://lll-deshihito.vercel.app/api/auth",
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account) token.provider = account.provider;
      if (!token.supabaseUserId && user?.email) {
        const mapped = await mapNextAuthUserToSupabaseUser({ email: user.email, name: user.name, image: user.image });
        token.supabaseUserId = mapped.id;
        token.mappedAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.supabaseUserId ?? "";
        session.user.provider = token.provider as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
