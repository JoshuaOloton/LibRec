import type { DefaultSession } from "next-auth";

type Role = "PATRON" | "ADMIN";

declare module "next-auth" {
  interface User {
    role: Role;
  }
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}
