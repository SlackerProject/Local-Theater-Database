"use client";

import { useActionState } from "react";
import { signIn, type AuthFormState } from "@/app/auth-actions";
import { FormError, PrimaryButton, TextField } from "@/components/AuthCard";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <FormError message={state.error} />
      <TextField label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" />
      <PrimaryButton pending={pending}>{pending ? "Signing in…" : "Sign in"}</PrimaryButton>
    </form>
  );
}
