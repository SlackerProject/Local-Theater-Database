"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { entityKey, type BulkPreview, type SiteRef } from "@/lib/bulk";
import { checkBundle, personNameKey, type Bundle, type NewProductionBundle } from "@/lib/submission";
import { sameNameMatches } from "@/lib/same-name";
import type { Json } from "@/lib/database.types";

// Bulk upload, moderators only. Every function checks the role; the
// database functions check it again.

async function moderatorClient() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "moderator")) throw new Error("Only moderators can bulk upload.");
  return { supabase: await createClient(), user };
}

// Match the file's shows, companies, venues and people to the site, and
// find productions that are already here (same show, company and year)
export async function previewBulk(input: {
  productions: { ref: string; show: string; company: string; venue: string; venueTown: string; year: number | null }[];
  people: string[];
}): Promise<{ ok: true; preview: BulkPreview } | { ok: false; error: string }> {
  try {
    const { supabase } = await moderatorClient();
    const [{ data: shows }, { data: orgs }, { data: venues }, { data: positions }] = await Promise.all([
      supabase.from("shows").select("id, title").limit(20000),
      supabase.from("organizations").select("id, name, short_name").limit(20000),
      supabase.from("locations").select("id, name, town").limit(20000),
      supabase.from("crew_positions").select("name"),
    ]);

    const byKey = <T,>(rows: T[], keys: (r: T) => (string | null | undefined)[], ref: (r: T) => SiteRef) => {
      const out: Record<string, SiteRef> = {};
      for (const r of rows) for (const k of keys(r)) if (k && !out[entityKey(k)]) out[entityKey(k)] = ref(r);
      return out;
    };
    const showMap = byKey(shows ?? [], (s) => [s.title], (s) => ({ id: s.id, label: s.title }));
    const orgMap = byKey(orgs ?? [], (o) => [o.name, o.short_name], (o) => ({ id: o.id, label: o.name }));
    // Venues: a name shared by two towns is matched using the file's town
    const venueMap: Record<string, SiteRef> = {};
    for (const p of input.productions) {
      if (!p.venue) continue;
      const k = entityKey(p.venue);
      const same = (venues ?? []).filter((v) => entityKey(v.name) === k);
      const pick = same.find((v) => v.town && p.venueTown && v.town.toLowerCase() === p.venueTown.toLowerCase()) ?? same[0];
      if (pick && !venueMap[k]) venueMap[k] = { id: pick.id, label: pick.town ? `${pick.name}, ${pick.town}` : pick.name };
    }

    // Already on the site: same show, company and year
    const existing: BulkPreview["existing"] = {};
    const candidates = input.productions.filter((p) => p.year && showMap[entityKey(p.show)] && orgMap[entityKey(p.company)]);
    if (candidates.length) {
      const { data: prods } = await supabase
        .from("productions")
        .select("id, slug, year, show_id, organization_id, title_override, show:shows(title), credits(count), performances(count)")
        .in("show_id", [...new Set(candidates.map((p) => showMap[entityKey(p.show)].id))]);
      for (const p of candidates) {
        const hit = (prods ?? []).find(
          (x) => x.show_id === showMap[entityKey(p.show)].id && x.organization_id === orgMap[entityKey(p.company)].id && x.year === p.year,
        );
        if (hit)
          existing[p.ref] = {
            id: hit.id,
            slug: hit.slug,
            label: `${hit.title_override ?? hit.show?.title} (${hit.year})`,
            credits: hit.credits?.[0]?.count ?? 0,
            performances: hit.performances?.[0]?.count ?? 0,
          };
      }
    }

    return {
      ok: true,
      preview: {
        shows: showMap,
        companies: orgMap,
        venues: venueMap,
        people: await sameNameMatches(supabase, input.people),
        existing,
        positions: (positions ?? []).map((p) => p.name),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t read the site’s records." };
  }
}

export async function startBulk(fileName: string, newPositions: string[]): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { supabase } = await moderatorClient();
    if (newPositions.length) await supabase.rpc("add_crew_positions", { p_names: newPositions.slice(0, 200) });
    const { data, error } = await supabase.rpc("bulk_import_start", { p_file_name: fileName });
    if (error || !data) return { ok: false, error: error?.message ?? "Couldn’t start the upload." };
    return { ok: true, id: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t start the upload." };
  }
}

export type ImportedOne = {
  ok: true;
  productionId: string;
  slug: string;
  showId: string;
  companyId: string;
  venueId: string | null;
  people: { key: string; id: string; label: string }[]; // by personNameKey
};

// One production: saved as the moderator's submission and approved at once
// (Replace swaps an existing production's cast, crew and dates for the file's)
export async function importBulkProduction(
  batchId: string,
  bundle: NewProductionBundle,
  replace: { id: string } | null,
  note: string,
): Promise<ImportedOne | { ok: false; error: string }> {
  try {
    const { supabase, user } = await moderatorClient();
    const problems = checkBundle(bundle);
    if (problems.length) return { ok: false, error: problems.join(" ") };

    let toSave: Bundle = bundle;
    if (replace) {
      // Only the cast, crew, dates and venue change; the page itself stays
      const { show: _s, organization: _o, production, ...items } = bundle;
      void _s;
      void _o;
      toSave = { ...items, production: { id: replace.id, display_title: production.display_title } };
    }

    const { data: prop, error: propError } = await supabase
      .from("edit_proposals")
      .insert({ entity_table: "production_submission", changes: toSave as unknown as Json, proposed_by: user.id, note: note.slice(0, 2000) })
      .select("id")
      .single();
    if (propError || !prop) return { ok: false, error: propError?.message ?? "Couldn’t save it." };

    // Replace clears and refills the production in one step (all or nothing)
    const { data: prodId, error } = replace
      ? await supabase.rpc("bulk_replace_production", {
          p_proposal_id: prop.id,
          p_bundle: toSave as unknown as Json,
          p_opening: bundle.production.opening_date as string,
          p_closing: bundle.production.closing_date as string,
          p_clear_venue: !!bundle.location,
        })
      : await supabase.rpc("approve_submission_checked", { p_proposal_id: prop.id, p_bundle: toSave as unknown as Json });
    if (error || !prodId) {
      await supabase.from("edit_proposals").delete().eq("id", prop.id);
      return { ok: false, error: error?.message ?? "Couldn’t save it." };
    }
    await supabase.rpc("bulk_import_add", { p_id: batchId, p_production: prodId, p_proposal: prop.id, p_replaced: !!replace });

    const { data: p } = await supabase
      .from("productions")
      .select("id, slug, show_id, organization_id, location_id, credits(person:people(id, display_name))")
      .eq("id", prodId)
      .single();
    if (!p) return { ok: false, error: "Saved, but couldn’t read it back." };
    const people = new Map<string, { key: string; id: string; label: string }>();
    for (const c of p.credits ?? []) if (c.person) people.set(c.person.id, { key: personNameKey(c.person.display_name), id: c.person.id, label: c.person.display_name });

    return { ok: true, productionId: p.id, slug: p.slug, showId: p.show_id, companyId: p.organization_id, venueId: p.location_id, people: [...people.values()] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save it." };
  }
}

export async function finishBulk(): Promise<void> {
  for (const p of ["/", "/shows", "/people", "/companies", "/calendar", "/map", "/moderate/bulk"]) revalidatePath(p);
}

export async function undoBulk(batchId: string): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  try {
    const { supabase } = await moderatorClient();
    const { data, error } = await supabase.rpc("bulk_import_undo", { p_id: batchId });
    if (error) return { ok: false, error: error.message };
    await finishBulk();
    return { ok: true, removed: data ?? 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t undo the upload." };
  }
}
