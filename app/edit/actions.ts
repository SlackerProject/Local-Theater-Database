"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import type { Changes, PageTable } from "@/lib/corrections";
import type { MergeTable } from "@/lib/merge";
import { findPages, type PageHit } from "@/lib/page-search";

// submit_correction() validates everything and decides whether it applies
// now (moderators) or waits for review (everyone else)
export async function submitCorrection(
  table: PageTable,
  id: string,
  changes: Changes,
  note: string,
  pagePath: string,
): Promise<{ ok: true; published: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Your session ended. Sign in again, then submit." };
  const { data, error } = await supabase.rpc("submit_correction", {
    p_table: table,
    p_id: id,
    p_changes: changes as unknown as Json,
    p_note: note,
  });
  if (error) return { ok: false, error: error.message };
  for (const p of [pagePath, "/moderate", "/calendar"]) revalidatePath(p);
  return { ok: true, published: data === "published" };
}

// "This is the same … as another page": search, then send it to moderators
export async function findOtherPages(table: MergeTable, q: string): Promise<PageHit[]> {
  const supabase = await createClient();
  return findPages(supabase, table, q);
}

export async function reportSamePage(table: MergeTable, id: string, other: string, note: string, pagePath: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Your session ended. Sign in again, then send it." };
  const { error } = await supabase.rpc("report_same_page", { p_table: table, p_id: id, p_other: other, p_note: note });
  if (error) return { ok: false, error: error.message };
  for (const p of [pagePath, "/moderate"]) revalidatePath(p);
  return { ok: true };
}
