"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { MEDIA_BUCKET } from "@/lib/media";
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

// Uploads (photos, posters, headshots). review_media() checks the moderator
// role; rejected files are then deleted from storage to save space.
export async function reviewUploads(ids: string[], approve: boolean, note = ""): Promise<{ ok: boolean; problems: string[] }> {
  const supabase = await createClient();
  const problems: string[] = [];
  const toDelete: string[] = [];

  const { data: rows } = await supabase.from("media").select("id, storage_key, thumb_key").in("id", ids);
  for (const id of ids) {
    const { error } = await supabase.rpc("review_media", { p_media_id: id, p_approve: approve, p_note: note });
    if (error) {
      problems.push(error.message);
      continue;
    }
    const row = rows?.find((r) => r.id === id);
    if (!approve && row) toDelete.push(row.storage_key, ...(row.thumb_key ? [row.thumb_key] : []));
  }
  if (toDelete.length) {
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(toDelete);
    if (error) problems.push(`Rejected, but the files couldn't be deleted: ${error.message}`);
  }
  revalidatePath("/moderate");
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

// Claims, disputes and suggested corrections (migration 0008). Each
// database function checks the reviewer's role and the self-review rules.
type Done = { ok: boolean; error?: string };
async function call(fn: () => PromiseLike<{ error: { message: string } | null }>): Promise<Done> {
  const { error } = await fn();
  revalidatePath("/moderate");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function reviewClaim(id: string, verify: boolean): Promise<Done> {
  const supabase = await createClient();
  return call(() => supabase.rpc("review_claim", { p_claim_id: id, p_verify: verify }));
}

export async function vouchForClaim(id: string): Promise<Done> {
  const supabase = await createClient();
  return call(() => supabase.rpc("vouch_claim", { p_claim_id: id }));
}

export async function resolveDispute(id: string, undo: boolean): Promise<Done> {
  const supabase = await createClient();
  return call(() => supabase.rpc("resolve_dispute", { p_id: id, p_undo: undo }));
}

export async function reviewSuggestion(id: string, approve: boolean, note = ""): Promise<Done> {
  const supabase = await createClient();
  return call(() => supabase.rpc("approve_person_edit", { p_proposal_id: id, p_approve: approve, p_note: note }));
}

export async function rejectSubmission(id: string, note: string): Promise<ReviewResult | void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_submission", { p_proposal_id: id, p_note: note });
  if (error) return { ok: false, problems: [error.message] };
  redirect("/moderate?rejected=1");
}
