import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Optimistic checks only (see authorized() in auth.config.ts). Admin pages re-check the role.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
