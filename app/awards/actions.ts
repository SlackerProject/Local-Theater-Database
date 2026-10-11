"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Trusted editors and moderators add awards; submit_award() checks the role
// and publishes moderators' entries at once (others go to review)
export type AwardInput = {
  body_id?: string;
  new_body?: string;
  year: string;
  category_id?: string;
  new_category?: string;
  production_id: string;
  credit_id?: string;
  result: "nominated" | "won";
};

export async function submitAward(award: AwardInput, note: string): Promise<{ ok: true; published: boolean } | { ok: false; error: string }> {
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
