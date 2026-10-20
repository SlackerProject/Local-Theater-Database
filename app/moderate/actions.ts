"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { fillVenuePins } from "@/lib/geocode";
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
  // The checked version refuses new people who are already on the site,
  // unless marked as a different person
  const { data: productionId, error } = await supabase.rpc("approve_submission_checked", {
    p_proposal_id: id,
    p_bundle: bundle as unknown as Json,
    p_left_out: isEmptyLeftOut(leftOut) ? undefined : (leftOut as unknown as Json),
    p_note: note,
  });
  if (error) return { ok: false, problems: [error.message] };
  after(() => fillVenuePins(supabase)); // a new venue gets its map pin

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

// ---------------------------------------------------------------------
// Members: roles (admin only) and suspensions (moderators, for members
// below their own role). The database functions enforce both.
// ---------------------------------------------------------------------
export async function setMemberRole(userId: string, role: "member" | "trusted" | "moderator"): Promise<Done> {
  const supabase = await createClient();
  const r = await call(() => supabase.rpc("set_member_role", { p_user: userId, p_role: role }));
  revalidatePath("/moderate/members");
  return r;
}

export async function suspendMember(userId: string, reason: string): Promise<Done & { rejected?: number }> {
  const supabase = await createClient();
  // Their waiting uploads are rejected; remove the files too
  const { data: files } = await supabase.from("media").select("storage_key, thumb_key").eq("uploaded_by", userId).eq("status", "pending");
  const { data, error } = await supabase.rpc("suspend_member", { p_user: userId, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  const keys = (files ?? []).flatMap((f) => [f.storage_key, ...(f.thumb_key ? [f.thumb_key] : [])]);
  if (keys.length) await supabase.storage.from(MEDIA_BUCKET).remove(keys);
  revalidatePath("/moderate/members");
  revalidatePath("/moderate");
  return { ok: true, rejected: data ?? 0 };
}

export async function restoreMember(userId: string): Promise<Done> {
  const supabase = await createClient();
  const r = await call(() => supabase.rpc("restore_member", { p_user: userId }));
  revalidatePath("/moderate/members");
  return r;
}

// The founding-member period (admin only): while open, every account is a
// founding member; closing it keeps the badge for accounts made before then
export async function setFoundingOpen(open: boolean): Promise<Done> {
  const supabase = await createClient();
  const r = await call(() => supabase.rpc("set_founding_open", { p_open: open }));
  revalidatePath("/moderate/members");
  return r;
}

// The home page's "[n] productions · [n] people … and counting" line
// (admin only; off until the numbers are worth showing)
export async function setHomeCounts(show: boolean): Promise<Done> {
  const supabase = await createClient();
  const r = await call(() => supabase.rpc("set_home_counts", { p_show: show }));
  revalidatePath("/moderate/members");
  revalidatePath("/");
  return r;
}

// Add positions (approved from "Other…") to the crew positions list
export async function addCrewPositions(names: string[]): Promise<Done> {
  if (!names.length) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_crew_positions", { p_names: names });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Bug reports from the footer: fixed, dismissed, or reopened
// Feedback filed under the wrong kind (a bug that is really an idea...)
export async function setFeedbackKind(id: string, kind: string): Promise<Done> {
  const supabase = await createClient();
  const r = await call(() => supabase.rpc("set_feedback_kind", { p_id: id, p_kind: kind }));
  revalidatePath("/moderate/bugs");
  return r;
}

export async function resolveBug(id: string, status: "open" | "fixed" | "dismissed"): Promise<Done> {
  const supabase = await createClient();
  const r = await call(() => supabase.rpc("resolve_bug", { p_id: id, p_status: status }));
  revalidatePath("/moderate/bugs");
  return r;
}

// Write back to whoever sent feedback (they see it in their notifications);
// "done" also marks the feedback done
export async function replyToFeedback(id: string, body: string, done: boolean): Promise<Done> {
  const supabase = await createClient();
  const r = await call(() => supabase.rpc("reply_to_feedback", { p_id: id, p_body: body, p_done: done }));
  revalidatePath("/moderate/bugs");
  return r;
}

// Corrections: approve the ticked changes (none = rejected). A note-only
// correction is "marked done" instead.
export async function reviewCorrection(id: string, accept: string[], note: string, noteOnlyDone: boolean): Promise<Done> {
  const supabase = await createClient();
  if (noteOnlyDone) return call(() => supabase.rpc("resolve_suggestion", { p_proposal_id: id, p_done: true, p_note: note }));
  const result = await call(() => supabase.rpc("review_correction", { p_proposal_id: id, p_accept: accept, p_note: note }));
  after(() => fillVenuePins(supabase)); // a new or moved venue gets its map pin
  for (const p of ["/", "/calendar", "/shows", "/people", "/companies"]) revalidatePath(p);
  return result;
}

export async function resolveSuggestion(id: string, done: boolean, note = ""): Promise<Done> {
  const supabase = await createClient();
  return call(() => supabase.rpc("resolve_suggestion", { p_proposal_id: id, p_done: done, p_note: note }));
}

export async function reviewAuditions(id: string, approve: boolean, note = ""): Promise<Done> {
  const supabase = await createClient();
  return call(() => supabase.rpc("review_auditions", { p_proposal_id: id, p_approve: approve, p_note: note }));
}

// Permanently delete a page (moderator_delete() checks the role and blocks
// companies, shows and venues that productions still use). Photos and
// headshots are removed from storage too.
export type DeleteTable = "productions" | "people" | "organizations" | "shows" | "locations";

export async function deletePage(table: DeleteTable, id: string, withLeftovers: boolean): Promise<Done> {
  const supabase = await createClient();

  // Files that will be orphaned: the production's photos and posters, or
  // the person's headshots (plus leftovers' headshots)
  const files: string[] = [];
  const personIds = table === "people" ? [id] : [];
  if (table === "productions") {
    const { data: media } = await supabase.from("media").select("storage_key, thumb_key").eq("production_id", id);
    for (const m of media ?? []) files.push(m.storage_key, ...(m.thumb_key ? [m.thumb_key] : []));
    if (withLeftovers) {
      const { data: leftovers } = await supabase.rpc("production_orphans", { p_production_id: id });
      personIds.push(...(leftovers ?? []).filter((l) => l.entity_table === "people").map((l) => l.entity_id));
    }
  }
  if (personIds.length) {
    const { data: media } = await supabase.from("media").select("storage_key, thumb_key").in("person_id", personIds);
    for (const m of media ?? []) files.push(m.storage_key, ...(m.thumb_key ? [m.thumb_key] : []));
  }

  const { error } = await supabase.rpc("moderator_delete", { p_table: table, p_id: id, p_with_orphans: withLeftovers });
  if (error) return { ok: false, error: error.message };
  if (files.length) await supabase.storage.from(MEDIA_BUCKET).remove(files);
  for (const p of ["/", "/shows", "/people", "/companies", "/calendar"]) revalidatePath(p);
  return { ok: true };
}

export async function rejectSubmission(id: string, note: string): Promise<ReviewResult | void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_submission", { p_proposal_id: id, p_note: note });
  if (error) return { ok: false, problems: [error.message] };
  redirect("/moderate?rejected=1");
}

// ---------------------------------------------------------------------
// Young performers: a moderator turns named cast credits into
// young-performer credits (no person). A person left with no credits is
// deleted with their photos; the files are removed from storage here.
// ---------------------------------------------------------------------
export type YoungPreview = { name: string; otherCredits: number; photos: number; claimed: boolean; willDelete: boolean }[];

export async function youngPerformerPreview(creditIds: string[]): Promise<{ ok: true; people: YoungPreview } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("young_performer_preview", { p_credit_ids: creditIds });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    people: (data ?? []).map((r) => ({
      name: r.display_name,
      otherCredits: r.other_credits,
      photos: r.photos,
      claimed: r.claimed,
      willDelete: r.will_delete,
    })),
  };
}

export async function convertToYoungPerformer(creditIds: string[], path: string): Promise<Done> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_to_young_performer", { p_credit_ids: creditIds });
  if (error) return { ok: false, error: error.message };
  const keys = ((data as { storage_keys?: string[] } | null)?.storage_keys ?? []).filter(Boolean);
  if (keys.length) await supabase.storage.from(MEDIA_BUCKET).remove(keys);
  for (const p of [path, "/people", "/hotlist", "/"]) revalidatePath(p);
  return { ok: true };
}
