"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Account settings. Members may only change their own row, and only these
// columns (database column permissions).
export type Setting = "notify_updates" | "show_seen" | "profile_public";

export async function saveSetting(setting: Setting, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Sign in first." };
  const { error } = await supabase
    .from("profiles")
    .update({ [setting]: on } as { notify_updates?: boolean; show_seen?: boolean; profile_public?: boolean })
    .eq("id", data.user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  revalidatePath("/u/[username]", "page");
  return { ok: true };
}
