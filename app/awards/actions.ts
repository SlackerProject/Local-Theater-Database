"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole } from "@/lib/auth";

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

// ---------------------------------------------------------------------
// The season editor: nominees by category, then winners
// ---------------------------------------------------------------------
async function moderatorClient() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "moderator")) throw new Error("Only moderators can do this.");
  return createClient();
}

const failed = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "That didn’t work." });
const refresh = () => ["/awards", "/awards/add"].forEach((p) => revalidatePath(p));

// Add one nominee: a production with everyone it names (one entry each), or
// for honors, a person and the company that presented it
export async function addNominee(n: {
  ceremony_id: string;
  category_id: string;
  production_id?: string;
  credit_ids?: string[];
  person_id?: string;
  organization_id?: string;
  source_url: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await moderatorClient();
    const base: AwardInput = { ceremony_id: n.ceremony_id, category_id: n.category_id, result: "nominated", source_url: n.source_url };
    const awards: AwardInput[] = n.person_id
      ? [{ ...base, person_id: n.person_id, ...(n.organization_id && { organization_id: n.organization_id }) }]
      : n.credit_ids?.length
        ? n.credit_ids.map((credit_id) => ({ ...base, production_id: n.production_id, credit_id }))
        : [{ ...base, production_id: n.production_id }];
    for (const a of awards) {
      const r = await submitAward(a);
      if (!r.ok) return r;
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

// Won or just nominated (ties are fine: several nominees can win)
export async function setWinner(entryIds: string[], won: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await moderatorClient();
    const { error } = await supabase.from("award_entries").update({ result: won ? "won" : "nominated" }).in("id", entryIds);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

export async function removeNominee(entryIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await moderatorClient();
    const { error } = await supabase.from("award_entries").delete().in("id", entryIds);
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}
