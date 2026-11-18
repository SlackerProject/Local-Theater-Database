"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Moderators add awards; submit_award() checks the role and the rules
// (a source link, no names for youth or ensemble awards, and so on)
export type AwardInput = {
  ceremony_id: string;
  category_id: string;
  production_id?: string;
  credit_id?: string;
  person_id?: string;
  organization_id?: string;
  result: "nominated" | "won";
  source_url: string;
};

export async function submitAward(award: AwardInput, note = ""): Promise<{ ok: true; published: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_award", { p_award: award, p_note: note });
  if (error) return { ok: false, error: error.message };
  for (const p of ["/awards", "/moderate"]) revalidatePath(p);
  return { ok: true, published: data === "published" };
}

export async function reviewAward(id: string, approve: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_award", { p_proposal_id: id, p_approve: approve });
  revalidatePath("/moderate");
  revalidatePath("/awards");
  return error ? { ok: false, error: error.message } : { ok: true };
}
