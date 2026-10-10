"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkBundle, isEmptyLeftOut, type Bundle, type LeftOut } from "@/lib/submission";
import type { Json } from "@/lib/database.types";

// approve_submission() and reject_submission() check the moderator role
// themselves, so these actions can't be used to bypass it.

export type ReviewResult = { ok: false; problems: string[] };

export async function approveSubmission(
  id: string,
  bundle: Bundle,
  leftOut: LeftOut,
  note: string,
): Promise<ReviewResult | void> {
  const problems = checkBundle(bundle);
  if (problems.length) return { ok: false, problems };

  const supabase = await createClient();
  const { data: productionId, error } = await supabase.rpc("approve_submission", {
    p_proposal_id: id,
    p_bundle: bundle as unknown as Json,
    p_left_out: isEmptyLeftOut(leftOut) ? undefined : (leftOut as unknown as Json),
    p_note: note,
  });
  if (error) return { ok: false, problems: [error.message] };

  const { data: production } = await supabase.from("productions").select("slug").eq("id", productionId).single();
  redirect(`/moderate?approved=${encodeURIComponent(production?.slug ?? "")}`);
}

export async function rejectSubmission(id: string, note: string): Promise<ReviewResult | void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_submission", { p_proposal_id: id, p_note: note });
  if (error) return { ok: false, problems: [error.message] };
  redirect("/moderate?rejected=1");
}
