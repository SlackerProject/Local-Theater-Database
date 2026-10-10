"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  bundleToFormState,
  isAddTo,
  isEmptyLeftOut,
  leftOutToFormState,
  type Bundle,
  type FormState,
  type LeftOut,
} from "@/lib/submission";
import type { Json } from "@/lib/database.types";

// "Fix and resubmit": turn a rejected submission, or the items a moderator
// left out, into the member's draft and open the form.
export async function reopenSubmission(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/signin?next=/submissions");

  // RLS limits this to the member's own submissions
  const { data: p } = await supabase
    .from("edit_proposals")
    .select("id, status, changes, approved_changes, left_out, entity_id")
    .eq("id", id)
    .eq("proposed_by", auth.user.id)
    .maybeSingle();
  if (!p) redirect("/submissions");

  const year = new Date().toLocaleDateString("en-US", { year: "numeric", timeZone: "America/New_York" });
  const liveHasLocation = async (productionId: string) => {
    const { data } = await supabase.from("productions").select("location_id").eq("id", productionId).maybeSingle();
    return !!data?.location_id;
  };

  let form: FormState | null = null;
  if (p.status === "rejected") {
    const submitted = p.changes as unknown as Bundle;
    form = bundleToFormState(submitted, year, isAddTo(submitted) ? await liveHasLocation(submitted.production.id) : false);
  } else if (p.status === "approved" && p.entity_id && !isEmptyLeftOut(p.left_out as unknown as LeftOut)) {
    const approved = (p.approved_changes ?? p.changes) as unknown as Bundle;
    form = leftOutToFormState(
      p.left_out as unknown as LeftOut,
      { id: p.entity_id, label: approved.production.display_title, hasLocation: await liveHasLocation(p.entity_id) },
      year,
    );
  }
  if (!form) redirect("/submissions");

  form.resubmissionOf = p.id;
  await supabase.from("submission_drafts").upsert({ user_id: auth.user.id, data: form as unknown as Json });
  redirect("/add");
}
