import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js config (no Prisma, no bcrypt): it is imported by proxy.ts.
 * The credentials provider lives in auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    // Optimistic route check only. Admin pages and actions must re-check the role on the server.
    authorized({ auth, request: { nextUrl } }) {
      const path = nextUrl.pathname;
      const user = auth?.user;

      if (path.startsWith("/admin")) {
        if (!user) return false; // redirects to /login?callbackUrl=...
        if (user.role !== "ADMIN") return Response.redirect(new URL("/catalogue", nextUrl));
        return true;
      }
      if (path.startsWith("/recommendations") || path.startsWith("/onboarding")) {
        return !!user;
      }
      if ((path === "/login" || path === "/register") && user) {
        return Response.redirect(new URL("/catalogue", nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      if (token.role) session.user.role = token.role as "PATRON" | "ADMIN";
      return session;
    },
  },
} satisfies NextAuthConfig;
