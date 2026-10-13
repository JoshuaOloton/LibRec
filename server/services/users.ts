import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";

const BCRYPT_COST = 10;

// Compared against when the email is unknown, so timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists.");
  }
}

/** FR1: create a patron. Admins only come from the seed. Emails are stored lowercase. */
export async function registerUser(input: { name: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) throw new EmailTakenError();

  try {
    return await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
        role: "PATRON",
      },
      select: { id: true, name: true, email: true, role: true },
    });
  } catch (err) {
    // Two registrations racing on the same email: the unique index is the real guard.
    if ((err as { code?: string }).code === "P2002") throw new EmailTakenError();
    throw err;
  }
}

/** Returns the user when the credentials are valid, otherwise null (never says which part was wrong). */
export async function verifyCredentials(emailInput: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: emailInput.trim().toLowerCase() } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
