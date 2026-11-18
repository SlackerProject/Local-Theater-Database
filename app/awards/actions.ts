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
  nomination_id?: string;
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

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Add one nominee (or a winner, for winner-only awards): a production with
// everyone it names (one entry each), a company, or a person
export async function addNominee(n: {
  ceremony_id: string;
  category_id: string;
  production_id?: string;
  credit_ids?: string[];
  person_ids?: string[];
  person_id?: string;
  organization_id?: string;
  source_url: string;
  won?: boolean;
}): Promise<Result> {
  try {
    await moderatorClient();
    // Everyone added together is one nomination
    const base: AwardInput = {
      ceremony_id: n.ceremony_id,
      category_id: n.category_id,
      result: n.won ? "won" : "nominated",
      source_url: n.source_url,
      nomination_id: crypto.randomUUID(),
    };
    const awards: AwardInput[] = n.organization_id
      ? [{ ...base, organization_id: n.organization_id }]
      : n.person_id
        ? [{ ...base, person_id: n.person_id }]
        : n.credit_ids?.length || n.person_ids?.length
          ? [
              ...(n.credit_ids ?? []).map((credit_id) => ({ ...base, production_id: n.production_id, credit_id })),
              ...(n.person_ids ?? []).map((person_id) => ({ ...base, production_id: n.production_id, person_id })),
            ]
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
export async function setWinner(entryIds: string[], won: boolean): Promise<Result> {
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

export async function removeNominee(entryIds: string[]): Promise<Result> {
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

// Take one name off a nomination. The last name leaves the nomination
// standing for its show, with no one named yet.
export async function removeFromNomination(entryId: string): Promise<Result> {
  try {
    const supabase = await moderatorClient();
    const { data: e } = await supabase
      .from("award_entries")
      .select("nomination_id, ceremony_id, category_id, production_id, result, source_url")
      .eq("id", entryId)
      .maybeSingle();
    if (!e) return { ok: false, error: "That name is already off this nomination." };
    const { error } = await supabase.from("award_entries").delete().eq("id", entryId);
    if (error) return { ok: false, error: error.message };
    const { count } = await supabase.from("award_entries").select("id", { count: "exact", head: true }).eq("nomination_id", e.nomination_id);
    if (!count && e.production_id) {
      const r = await submitAward({
        ceremony_id: e.ceremony_id,
        category_id: e.category_id,
        production_id: e.production_id,
        result: e.result,
        source_url: e.source_url,
        nomination_id: e.nomination_id,
      });
      if (!r.ok) return r;
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

// Someone who isn't on the site yet (confirmed 18 or older)
export async function createPerson(name: string, adult: boolean): Promise<Result<{ id: string }>> {
  try {
    const supabase = await moderatorClient();
    const { data, error } = await supabase.rpc("create_person_for_award", { p_name: name, p_adult: adult });
    if (error || !data) return { ok: false, error: error?.message ?? "That didn’t work." };
    return { ok: true, id: data };
  } catch (e) {
    return failed(e);
  }
}

// Ceremonies: a name (DASH Awards) and a season (2025–2026)
export async function createCeremony(name: string, season: string, sourceUrl: string, copy: boolean): Promise<Result<{ id: string }>> {
  try {
    const supabase = await moderatorClient();
    const { data, error } = await supabase.rpc("create_award_ceremony", { p_name: name, p_season: season, p_source_url: sourceUrl, p_copy: copy });
    if (error || !data) return { ok: false, error: error?.message ?? "That didn’t work." };
    refresh();
    return { ok: true, id: data };
  } catch (e) {
    return failed(e);
  }
}

export async function deleteCeremony(id: string): Promise<Result> {
  try {
    const supabase = await moderatorClient();
    const { error } = await supabase.rpc("delete_award_ceremony", { p_id: id });
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

// The awards a ceremony gives
export async function addCeremonyAward(ceremonyId: string, name: string, kind: string, hasNominees: boolean, consultant = false): Promise<Result> {
  try {
    const supabase = await moderatorClient();
    const { error } = await supabase.rpc("add_ceremony_award", { p_ceremony: ceremonyId, p_name: name, p_kind: kind, p_has_nominees: hasNominees, p_consultant: consultant });
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

export async function removeCeremonyAward(ceremonyId: string, categoryId: string): Promise<Result> {
  try {
    const supabase = await moderatorClient();
    const { error } = await supabase.rpc("remove_ceremony_award", { p_ceremony: ceremonyId, p_category: categoryId });
    if (error) return { ok: false, error: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

// Add people to an existing nomination (a design team member who wasn't on
// the site yet, say). A nomination saved with no names loses that blank entry.
export async function addToNomination(
  nominationId: string,
  people: { id?: string; name: string }[],
  adult: boolean,
): Promise<Result> {
  try {
    const supabase = await moderatorClient();
    const { data: first } = await supabase
      .from("award_entries")
      .select("ceremony_id, category_id, production_id, result, source_url")
      .eq("nomination_id", nominationId)
      .limit(1)
      .maybeSingle();
    if (!first) return { ok: false, error: "That nomination no longer exists." };
    for (const p of people) {
      let personId = p.id;
      if (!personId) {
        const made = await createPerson(p.name, adult);
        if (!made.ok) return made;
        personId = made.id;
      }
      // Their credit in the production, if they have one
      const { data: credit } = first.production_id
        ? await supabase.from("credits").select("id").eq("production_id", first.production_id).eq("person_id", personId).limit(1).maybeSingle()
        : { data: null };
      const r = await submitAward({
        ceremony_id: first.ceremony_id,
        category_id: first.category_id,
        ...(first.production_id && { production_id: first.production_id }),
        ...(credit ? { credit_id: credit.id } : { person_id: personId }),
        result: first.result,
        source_url: first.source_url,
        nomination_id: nominationId,
      });
      if (!r.ok) return r;
    }
    await supabase.from("award_entries").delete().eq("nomination_id", nominationId).is("person_id", null).is("credit_id", null);
    refresh();
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}
