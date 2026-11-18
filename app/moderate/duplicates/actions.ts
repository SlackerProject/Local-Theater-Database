"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole } from "@/lib/auth";

// Merging duplicates and dismissing "potential duplicate" flags. Moderators
// only; the database functions check the role again.

import type { MergeTable } from "@/lib/merge";
import { findPages, type PageHit } from "@/lib/page-search";
export type { PageHit };

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
  const supabase = await moderator();
  return findPages(supabase, table, q);
}
