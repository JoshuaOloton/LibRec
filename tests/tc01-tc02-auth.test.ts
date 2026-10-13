import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { authConfig } from "@/auth.config";
import { prisma } from "@/server/db";
import { EmailTakenError, registerUser, verifyCredentials } from "@/server/services/users";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("TC01 registration and login (FR1)", () => {
  it("creates a patron account, then authenticates with the same credentials", async () => {
    const created = await registerUser({ name: "Ada Okoro", email: "ada@example.com", password: "correct horse" });
    expect(created.role).toBe("PATRON");

    const user = await verifyCredentials("ada@example.com", "correct horse");
    expect(user).toMatchObject({ id: created.id, name: "Ada Okoro", email: "ada@example.com", role: "PATRON" });
  });

  it("treats the email case-insensitively", async () => {
    await registerUser({ name: "Ada", email: "Ada@Example.com", password: "correct horse" });
    expect(await verifyCredentials("  ADA@example.COM ", "correct horse")).not.toBeNull();
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    await registerUser({ name: "Ada", email: "ada@example.com", password: "correct horse" });
    expect(await verifyCredentials("ada@example.com", "wrong password")).toBeNull();
    expect(await verifyCredentials("nobody@example.com", "correct horse")).toBeNull();
  });

  it("refuses a second account with the same email", async () => {
    await registerUser({ name: "Ada", email: "ada@example.com", password: "correct horse" });
    await expect(registerUser({ name: "Other", email: "ADA@example.com", password: "another pass" })).rejects.toBeInstanceOf(
      EmailTakenError,
    );
    expect(await prisma.user.count()).toBe(1);
  });

  it("always registers a PATRON, never an admin", async () => {
    const created = await registerUser({ name: "Ada", email: "ada@example.com", password: "correct horse" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.id } })).role).toBe("PATRON");
  });

  it("sends a logged-in patron away from /login and /register to the catalogue", () => {
    const authorized = authConfig.callbacks.authorized;
    const auth = { user: { id: "1", role: "PATRON" } } as never;
    for (const path of ["/login", "/register"]) {
      const res = authorized({ auth, request: { nextUrl: new URL(`http://localhost${path}`) } } as never) as Response;
      expect(res.status).toBe(302);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/catalogue");
    }
  });
});

describe("TC02 credential storage (NFR6)", () => {
  it("stores a bcrypt hash, never the password", async () => {
    const password = "correct horse";
    const created = await registerUser({ name: "Ada", email: "ada@example.com", password });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.passwordHash).not.toBe(password);
    expect(row.passwordHash).not.toContain(password);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$10\$/); // bcrypt, cost 10
    expect(await bcrypt.compare(password, row.passwordHash)).toBe(true);
  });

  it("salts each hash, so equal passwords do not produce equal hashes", async () => {
    const a = await registerUser({ name: "A", email: "a@example.com", password: "same password" });
    const b = await registerUser({ name: "B", email: "b@example.com", password: "same password" });
    const rows = await prisma.user.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows[0].passwordHash).not.toBe(rows[1].passwordHash);
  });
});

describe("admin routes are protected (proxy check)", () => {
  const authorized = authConfig.callbacks.authorized;
  const check = (path: string, role?: "PATRON" | "ADMIN") =>
    authorized({
      auth: role ? { user: { id: "1", role } } : null,
      request: { nextUrl: new URL(`http://localhost${path}`) },
    } as never);

  it("blocks anonymous visitors (redirect to login)", () => {
    expect(check("/admin/books")).toBe(false);
  });

  it("redirects patrons to the catalogue", () => {
    const res = check("/admin/books", "PATRON") as Response;
    expect(new URL(res.headers.get("location")!).pathname).toBe("/catalogue");
  });

  it("lets admins through", () => {
    expect(check("/admin/books", "ADMIN")).toBe(true);
  });

  it("leaves the public catalogue open", () => {
    expect(check("/catalogue")).toBe(true);
  });
});
