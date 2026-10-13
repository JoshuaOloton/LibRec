"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import { EmailTakenError, registerUser } from "@/server/services/users";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string>>;
  values?: { name?: string; email?: string };
};

/**
 * Auth.js may hand back an absolute callbackUrl. Keep only its path, so the redirect always stays
 * on this site; anything unusable falls back to the catalogue.
 */
function safeRedirect(value: FormDataEntryValue | null, fallback = "/catalogue") {
  let to = typeof value === "string" ? value : "";
  if (/^https?:\/\//i.test(to)) {
    try {
      const u = new URL(to);
      to = u.pathname + u.search;
    } catch {
      to = "";
    }
  }
  return to.startsWith("/") && !to.startsWith("//") ? to : fallback;
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address, like name@example.com."));

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name (at least 2 characters).").max(80, "Use 80 characters or fewer."),
  email: emailSchema,
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer."), // bcrypt limit
});

async function signInAndRedirect(email: string, password: string, redirectTo: string): Promise<AuthFormState | never> {
  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "That email and password do not match an account. Check both and try again." };
    }
    throw err; // the redirect itself is thrown and must propagate
  }
  return {};
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Enter your email and password.", values: { email } };
  }
  const result = await signInAndRedirect(email, password, safeRedirect(formData.get("redirectTo")));
  return { ...result, values: { email } };
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const values = { name: raw.name, email: raw.email };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: NonNullable<AuthFormState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof typeof fieldErrors;
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, values };
  }

  const { name, email, password } = parsed.data;
  // Registration only ever creates patrons; admins come from the seed (DECISIONS.md).
  try {
    await registerUser({ name, email, password });
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return { fieldErrors: { email: "An account with this email already exists. Log in instead." }, values };
    }
    throw err;
  }

  // A new account starts on onboarding (TC15) unless it came from a specific page.
  const result = await signInAndRedirect(email, password, safeRedirect(formData.get("redirectTo"), "/onboarding"));
  return { ...result, values };
}
