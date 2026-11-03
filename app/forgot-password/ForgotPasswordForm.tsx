"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthFormState } from "@/app/auth-actions";
import { FormError, PrimaryButton, TextField } from "@/components/AuthCard";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestPasswordReset, {});

  if (state.checkEmail) {
    return (
      <div role="status" className="callout m-0 flex flex-col gap-2 text-[15px]">
        <strong>Check your email.</strong>
        <span>
          If there’s an account for <strong>{state.checkEmail}</strong>, we’ve sent a link to choose a new password. It can take a
          few minutes; check your spam folder too. The link works once, for an hour.
        </span>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <TextField label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} />
      <PrimaryButton pending={pending}>{pending ? "Sending…" : "Send me a reset link"}</PrimaryButton>
    </form>
  );
}
