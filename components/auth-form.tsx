"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { loginAction, registerAction, type AuthFormState } from "@/server/actions/auth";

export function AuthForm({ mode, redirectTo }: { mode: "login" | "register"; redirectTo?: string }) {
  const register = mode === "register";
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    register ? registerAction : loginAction,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      {state.error && (
        <p role="alert" className="border-l-[3px] border-danger bg-surface px-3 py-2 text-danger">
          {state.error}
        </p>
      )}

      {register && (
        <Field
          label="Name"
          name="name"
          autoComplete="name"
          defaultValue={state.values?.name}
          error={errors.name}
          required
        />
      )}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={errors.email}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={register ? "new-password" : "current-password"}
        hint={register ? "At least 8 characters." : undefined}
        error={errors.password}
        required
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (register ? "Creating account…" : "Logging in…") : register ? "Create account" : "Log in"}
      </Button>

      <p className="text-ink-muted">
        {register ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-shelf underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New to LibRec?{" "}
            <Link href="/register" className="font-bold text-shelf underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
