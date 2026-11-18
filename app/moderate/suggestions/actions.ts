"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

async function moderatorClient() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "moderator")) throw new Error("Only moderators can do this.");
  return createClient();
}

const failed = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "That didn’t work." });

// Add the award's person to the show's credits with this role
export async function addAwardCredit(entryId: string, role: string, productionSlug: string): Promise<Result> {
  try {
    const supabase = await moderatorClient();
    const { error } = await supabase.rpc("add_award_credit", { p_entry: entryId, p_role: role });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/moderate/suggestions");
    revalidatePath(`/production/${productionSlug}`);
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}

// Not needed (the credit is under another name, say): stop suggesting it
export async function dismissAwardCredit(entryIds: string[]): Promise<Result> {
  try {
    const supabase = await moderatorClient();
    for (const id of entryIds) {
      const { error } = await supabase.rpc("dismiss_award_credit", { p_entry: id });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath("/moderate/suggestions");
    return { ok: true };
  } catch (e) {
    return failed(e);
  }
}
