"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { setNewPassword, type AuthFormState } from "@/app/auth-actions";
import { FormError, PrimaryButton, TextField } from "@/components/AuthCard";
import { createClient } from "@/lib/supabase/client";

type LinkState = "checking" | "ok" | "expired";

// The email's link carries a short sign-in after the # (so it works on any
// device). It's turned into a normal sign-in here, then the new password is
// saved on the server.
export function ResetPasswordForm() {
  const [link, setLink] = useState<LinkState>("checking");
  const [state, action, pending] = useActionState<AuthFormState, FormData>(setNewPassword, {});

  useEffect(() => {
    const supabase = createClient();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    // Keep the sign-in out of the address bar and history
    if (window.location.hash || query.has("code")) window.history.replaceState(null, "", "/reset-password");

    (async () => {
      if (hash.get("error") || query.get("error")) return setLink("expired");
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        return setLink(error ? "expired" : "ok");
      }
      const code = query.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return setLink(error ? "expired" : "ok");
      }
      // Already signed in (e.g. the page was reloaded)
      const { data } = await supabase.auth.getUser();
      setLink(data.user ? "ok" : "expired");
    })();
  }, []);

  if (state.done) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="callout m-0 text-[15px]">
          <strong>Your password is changed</strong> and you’re signed in.
        </p>
        <Link href="/" className="btn-primary w-full">
          Go to the home page
        </Link>
      </div>
    );
  }

  if (link === "checking") return <p className="m-0 text-muted">Checking your link…</p>;

  if (link === "expired") {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="callout m-0 text-[15px]">
          That reset link has expired or was already used. Links work once, for an hour.
        </p>
        <Link href="/forgot-password" className="btn-primary w-full">
          Send me a new link
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <TextField label="New password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." />
      <TextField label="Type it again" name="confirm" type="password" autoComplete="new-password" />
      <PrimaryButton pending={pending}>{pending ? "Saving…" : "Save my new password"}</PrimaryButton>
    </form>
  );
}
