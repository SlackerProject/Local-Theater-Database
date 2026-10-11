"use server";

import { siteOrigin } from "@/lib/site";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  checkEmail?: string;
  values?: Record<string, string>;
};

const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

// Only same-site paths, so a crafted link can't send people elsewhere after sign-in.
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const ageConfirmed = formData.get("age_confirmed") === "on";
  const next = safeNext(formData.get("next"));
  const values = { email, username, display_name: displayName };

  if (!email || !password || !username || !displayName) {
    return { error: "Please fill in every field.", values };
  }
  if (!USERNAME_RE.test(username)) {
    return { error: "Usernames are 3–30 letters, numbers or underscores.", values };
  }
  if (displayName.length > 80) {
    return { error: "Display names can be up to 80 characters.", values };
  }
  if (password.length < 8) {
    return { error: "Passwords need at least 8 characters.", values };
  }
  if (!ageConfirmed) {
    return { error: "You must be 18 or older to join.", values };
  }

  const supabase = await createClient();

  const { data: taken } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (taken) {
    return { error: "That username is taken. Try another.", values };
  }

  const origin = await siteOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, display_name: displayName, age_confirmed: true },
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    return { error: friendlyAuthError(error.message), values };
  }

  // With email confirmation on (the Supabase default), there's no session yet.
  if (!data.session) {
    return { checkEmail: email };
  }
  redirect(next);
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: friendlyAuthError(error.message), values: { email } };
  }
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return "That email and password don’t match.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first. Check your inbox for the link.";
  if (/already registered/i.test(message)) return "There’s already an account with that email. Try signing in.";
  if (/rate limit/i.test(message)) return "Too many attempts right now. Please wait a few minutes and try again.";
  if (/database error/i.test(message)) return "We couldn’t create your account. That username may have just been taken.";
  return message;
}
