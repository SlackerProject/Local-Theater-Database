"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Account settings. Members may only change their own row, and only these
// columns (database column permissions).
export type Setting = "notify_updates" | "show_seen";

export async function saveSetting(setting: Setting, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Sign in first." };
  const { error } = await supabase
    .from("profiles")
    .update(setting === "notify_updates" ? { notify_updates: on } : { show_seen: on })
    .eq("id", data.user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
