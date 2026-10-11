"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// respond_notification() only touches the signed-in member's own notifications
export async function respond(id: string, keep: boolean, note = ""): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_notification", { p_id: id, p_keep: keep, p_note: note.slice(0, 1000) });
  revalidatePath("/notifications");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function keepAll(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("keep_all_notifications");
  revalidatePath("/notifications");
  return error ? { ok: false, error: error.message } : { ok: true };
}
