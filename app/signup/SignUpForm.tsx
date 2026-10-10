"use client";

import { useActionState } from "react";
import { signUp, type AuthFormState } from "@/app/auth-actions";
import { FormError, PrimaryButton, TextField } from "@/components/AuthCard";

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUp, {});

  if (state.checkEmail) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-[10px] border-[1.5px] border-marquee bg-marquee-tint p-4">
        <strong>Check your email</strong>
        <span className="text-[15px] text-muted">
          We sent a confirmation link to <strong className="text-ink">{state.checkEmail}</strong>. Click it to finish
          creating your account. It may take a minute, and it can land in spam.
        </span>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <FormError message={state.error} />
      <TextField label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
      />
      <TextField
        label="Username"
        name="username"
        autoComplete="username"
        defaultValue={state.values?.username}
        hint="3–30 letters, numbers or underscores. Shown on your contributions."
      />
      <TextField
        label="Display name"
        name="display_name"
        autoComplete="name"
        defaultValue={state.values?.display_name}
        hint="How your name appears on the site."
      />
      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[15px]">
        <input
          type="checkbox"
          name="age_confirmed"
          required
          className="mt-0.5 h-5 w-5 flex-none accent-accent"
        />
        <span>
          I am <strong>18 or older</strong>. <span className="text-muted">Required. Members must be adults.</span>
        </span>
      </label>
      <PrimaryButton pending={pending}>{pending ? "Creating your account…" : "Create account"}</PrimaryButton>
    </form>
  );
}
