"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

// Claiming and owner controls. The database functions (migrations 0002 and
// 0008) check ownership and roles; these actions only validate input.

export type Result = { ok: true } | { ok: false; error: string };
export type PageLink = { label: string; url: string };

const fail = (error: string): Result => ({ ok: false, error });

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

function done(slug: string): Result {
  revalidatePath(`/person/${slug}`);
  return { ok: true };
}

function friendly(message: string) {
  if (/person_claims_one_active_per_user/.test(message))
    return "You already have a claim on another page. Each account can claim one page.";
  if (/person_claims_one_active_per_person/.test(message)) return "Someone has already claimed this page.";
  return message;
}

// ---------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------
export async function claimPage(personId: string, slug: string, evidenceUrl: string, note: string): Promise<Result> {
  const { supabase, userId } = await signedIn();
  if (!userId) return fail("Sign in to claim this page.");
  const url = evidenceUrl.trim();
  if (url && !/^https?:\/\/\S+\.\S+/i.test(url)) return fail("The link should start with https://");
  const { error } = await supabase.from("person_claims").insert({
    person_id: personId,
    user_id: userId,
    evidence_url: url || null,
    evidence_note: note.trim().slice(0, 1000) || null,
  });
  return error ? fail(friendly(error.message)) : done(slug);
}

// Display-name changes (and anything else) go through the review queue
export async function suggestCorrection(personId: string, slug: string, displayName: string, note: string): Promise<Result> {
  const { supabase, userId } = await signedIn();
  if (!userId) return fail("Sign in to suggest a correction.");
  const name = displayName.replace(/\s+/g, " ").trim();
  if (name.length > 80) return fail("Names can be up to 80 characters.");
  if (!name && !note.trim()) return fail("Enter the corrected name, or describe what should change.");
  const { error } = await supabase.from("edit_proposals").insert({
    entity_table: "people",
    entity_id: personId,
    changes: (name ? { display_name: name } : {}) as Json,
    note: note.trim().slice(0, 1000) || null,
    proposed_by: userId,
  });
  return error ? fail(error.message) : done(slug);
}

// ---------------------------------------------------------------------
// Owner controls
// ---------------------------------------------------------------------

// owner_update_person() replaces bio, links and headshot together, so
// start from the page's current values and change only what was asked.
async function updateOwnPage(slug: string, patch: { bio?: string | null; links?: PageLink[]; headshotId?: string | null }) {
  const { supabase, userId } = await signedIn();
  if (!userId) return fail("Your session ended. Sign in again.");
  const { data: page } = await supabase
    .from("people")
    .select("bio, links, headshot_media_id")
    .eq("verified_owner_id", userId)
    .maybeSingle();
  if (!page) return fail("This account doesn’t own a verified page.");
  const { error } = await supabase.rpc("owner_update_person", {
    p_bio: (patch.bio !== undefined ? patch.bio : page.bio) as string,
    p_links: (patch.links ?? page.links) as Json,
    p_headshot_media_id: (patch.headshotId !== undefined ? patch.headshotId : page.headshot_media_id) as string,
  });
  return error ? fail(error.message) : done(slug);
}

export async function saveBioAndLinks(slug: string, bio: string, links: PageLink[]): Promise<Result> {
  const text = bio.trim();
  if (text.length > 2000) return fail("Bios can be up to 2,000 characters.");
  const clean = links
    .map((l) => ({ label: l.label.trim().slice(0, 40), url: l.url.trim() }))
    .filter((l) => l.url);
  if (clean.length > 5) return fail("Add up to 5 links.");
  const bad = clean.find((l) => !/^https?:\/\/\S+\.\S+/i.test(l.url));
  if (bad) return fail(`“${bad.url}” should start with https://`);
  return updateOwnPage(slug, {
    bio: text || null,
    links: clean.map((l) => ({ label: l.label || l.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/.*$/, ""), url: l.url })),
  });
}

export async function chooseHeadshot(slug: string, mediaId: string | null): Promise<Result> {
  return updateOwnPage(slug, { headshotId: mediaId });
}

export async function addOwnCredit(slug: string, productionId: string, kind: "cast" | "crew", role: string): Promise<Result> {
  const { supabase } = await signedIn();
  if (!role.trim()) return fail("Enter the role.");
  const { error } = await supabase.rpc("owner_add_credit_named", {
    p_production_id: productionId,
    p_kind: kind,
    p_role: role.trim().slice(0, 120),
  });
  return error ? fail(error.message) : done(slug);
}

export async function setOwnCreditRole(slug: string, creditId: string, role: string): Promise<Result> {
  const { supabase } = await signedIn();
  if (!role.trim()) return fail("Enter the role.");
  const { error } = await supabase.rpc("owner_set_credit_role", { p_credit_id: creditId, p_role: role.trim().slice(0, 120) });
  return error ? fail(error.message) : done(slug);
}

export async function setOwnCreditHidden(slug: string, creditId: string, hidden: boolean): Promise<Result> {
  const { supabase } = await signedIn();
  const { error } = await supabase.rpc("owner_set_credit_hidden", { p_credit_id: creditId, p_hidden: hidden });
  return error ? fail(error.message) : done(slug);
}

export async function setOwnPageHidden(slug: string, hidden: boolean): Promise<Result> {
  const { supabase } = await signedIn();
  const { error } = await supabase.rpc("owner_set_page_hidden", { p_hidden: hidden });
  return error ? fail(error.message) : done(slug);
}
