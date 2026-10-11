"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Shows seen is hidden on profiles unless the member chooses to share it
export async function setShowSeen(show: boolean, username: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Sign in first." };
  const { error } = await supabase.from("profiles").update({ show_seen: show }).eq("id", data.user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/u/${username}`);
  return { ok: true };
}

// The one-time "You reached ..." message was dismissed
export async function dismissBadgeMessage(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_badges_seen");
  revalidatePath("/", "layout");
}
