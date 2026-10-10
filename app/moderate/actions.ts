"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// approve_submission() and reject_submission() check the moderator role
// themselves, so these actions can't be used to bypass it.

export async function approveSubmission(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { data: productionId, error } = await supabase.rpc("approve_submission", { p_proposal_id: id });
  if (error) redirect(`/moderate?error=${encodeURIComponent(error.message)}`);

  const { data: production } = await supabase.from("productions").select("slug").eq("id", productionId).single();
  redirect(`/moderate?approved=${encodeURIComponent(production?.slug ?? "")}`);
}

export async function rejectSubmission(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.rpc("reject_submission", { p_proposal_id: id, p_note: note });
  if (error) redirect(`/moderate?error=${encodeURIComponent(error.message)}`);
  redirect("/moderate?rejected=1");
}
