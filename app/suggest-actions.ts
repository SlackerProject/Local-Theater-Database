"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// "Suggest an edit" on any page: a note for the moderators, saved as a
// pending edit proposal (row-level security only lets members add their own)

export type SuggestTable = "productions" | "organizations" | "shows" | "locations";

export async function suggestEdit(table: SuggestTable, id: string, note: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Sign in to suggest an edit." };
  const text = note.trim();
  if (text.length < 5) return { ok: false, error: "Describe what should change." };
  if (text.length > 2000) return { ok: false, error: "Please keep it under 2,000 characters." };
  const { error } = await supabase.from("edit_proposals").insert({
    entity_table: table,
    entity_id: id,
    changes: {},
    note: text,
    proposed_by: data.user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/moderate");
  return { ok: true };
}
