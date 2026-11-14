"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole } from "@/lib/auth";

// Merging duplicates and dismissing "potential duplicate" flags. Moderators
// only; the database functions check the role again.

import type { MergeTable } from "@/lib/merge";
export type PageHit = { id: string; label: string; detail: string };

async function moderator() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "moderator")) throw new Error("Only moderators can do this.");
  return createClient();
}

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "That didn’t work." });

export async function dismissDuplicate(table: MergeTable, a: string, b: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await moderator();
    const { error } = await supabase.rpc("dismiss_duplicate", { p_table: table, p_a: a, p_b: b });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/moderate/duplicates");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function mergePreview(table: MergeTable, keep: string, remove: string): Promise<{ ok: true; summary: Record<string, number | string | null> } | { ok: false; error: string }> {
  try {
    const supabase = await moderator();
    const { data, error } = await supabase.rpc("merge_preview", { p_table: table, p_keep: keep, p_remove: remove });
    if (error) return { ok: false, error: error.message };
    return { ok: true, summary: (data ?? {}) as Record<string, number | string | null> };
  } catch (e) {
    return fail(e);
  }
}

export async function mergePages(table: MergeTable, keep: string, remove: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await moderator();
    const { error } = await supabase.rpc("merge_entities", { p_table: table, p_keep: keep, p_remove: remove });
    if (error) return { ok: false, error: error.message };
    for (const p of ["/moderate/duplicates", "/", "/people", "/shows", "/companies", "/hotlist", "/map", "/calendar"]) revalidatePath(p);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Find a page to merge by name
export async function searchPages(table: MergeTable, q: string): Promise<PageHit[]> {
  const term = q.trim().replace(/[%_,()]/g, " ");
  if (term.length < 2) return [];
  const supabase = await moderator();
  const like = `%${term}%`;
  if (table === "people") {
    const { data } = await supabase.from("people").select("id, display_name, credits(count)").ilike("display_name", like).limit(10);
    return (data ?? []).map((r) => ({ id: r.id, label: r.display_name, detail: `${r.credits?.[0]?.count ?? 0} credits` }));
  }
  if (table === "shows") {
    const { data } = await supabase.from("shows").select("id, title, authors, productions(count)").ilike("title", like).limit(10);
    return (data ?? []).map((r) => ({ id: r.id, label: r.title, detail: [`${r.productions?.[0]?.count ?? 0} productions`, r.authors].filter(Boolean).join(" · ") }));
  }
  if (table === "organizations") {
    const { data } = await supabase.from("organizations").select("id, name, town, productions(count)").ilike("name", like).limit(10);
    return (data ?? []).map((r) => ({ id: r.id, label: r.name, detail: [r.town, `${r.productions?.[0]?.count ?? 0} productions`].filter(Boolean).join(" · ") }));
  }
  if (table === "locations") {
    const { data } = await supabase.from("locations").select("id, name, street_address, town").ilike("name", like).limit(10);
    return (data ?? []).map((r) => ({ id: r.id, label: r.name, detail: [r.street_address, r.town].filter(Boolean).join(", ") }));
  }
  // Productions: by show title
  const { data } = await supabase
    .from("productions")
    .select("id, year, title_override, show:shows!inner(title), organization:organizations(name), credits(count)")
    .ilike("show.title", like)
    .order("year", { ascending: false })
    .limit(10);
  return (data ?? []).map((r) => ({
    id: r.id,
    label: `${r.title_override ?? r.show?.title} (${r.year})`,
    detail: [r.organization?.name, `${r.credits?.[0]?.count ?? 0} credits`].filter(Boolean).join(" · "),
  }));
}
