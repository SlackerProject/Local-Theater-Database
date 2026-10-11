"use server";

import { createClient } from "@/lib/supabase/server";
import { buildBundle, looksLikeFormState, type FormState } from "@/lib/submission";
import type { Json } from "@/lib/database.types";

export type ActionResult = { ok: true; savedAt?: string; submissionId?: string } | { ok: false; problems: string[] };

const MAX_BYTES = 200_000;

async function signedInClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

export async function submitProduction(state: FormState): Promise<ActionResult> {
  if (!looksLikeFormState(state) || JSON.stringify(state).length > MAX_BYTES) {
    return { ok: false, problems: ["Something went wrong reading the form. Please reload and try again."] };
  }
  const { supabase, userId } = await signedInClient();
  if (!userId) return { ok: false, problems: ["Your session ended. Sign in again, then submit."] };

  // Rebuild the bundle here rather than trusting one sent from the browser
  const { problems, bundle } = buildBundle(state);
  if (!bundle) return { ok: false, problems };

  const { data, error } = await supabase
    .from("edit_proposals")
    .insert({
      entity_table: "production_submission",
      changes: bundle as unknown as Json,
      proposed_by: userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, problems: [`We couldn’t save your submission: ${error.message}`] };

  await supabase.from("submission_drafts").delete().eq("user_id", userId);
  return { ok: true, submissionId: data.id };
}

export async function saveDraft(state: FormState): Promise<ActionResult> {
  if (!looksLikeFormState(state) || JSON.stringify(state).length > MAX_BYTES) {
    return { ok: false, problems: ["This draft is too large to save."] };
  }
  const { supabase, userId } = await signedInClient();
  if (!userId) return { ok: false, problems: ["Your session ended. Sign in again to save."] };

  const { data, error } = await supabase
    .from("submission_drafts")
    .upsert({ user_id: userId, data: state as unknown as Json })
    .select("updated_at")
    .single();
  if (error) return { ok: false, problems: [`We couldn’t save your draft: ${error.message}`] };
  return { ok: true, savedAt: data.updated_at };
}

export async function discardDraft(): Promise<ActionResult> {
  const { supabase, userId } = await signedInClient();
  if (!userId) return { ok: false, problems: ["Your session ended."] };
  await supabase.from("submission_drafts").delete().eq("user_id", userId);
  return { ok: true };
}
