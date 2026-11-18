"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

async function moderatorClient() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "moderator")) throw new Error("Only moderators can change programs.");
  return createClient();
}

const nice = (m: string) => (/duplicate key|company_programs_name/.test(m) ? "This company already has a program with that name." : m);

async function run(slug: string, fn: (s: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { message: string } | null }>): Promise<Result> {
  try {
    const supabase = await moderatorClient();
    const { error } = await fn(supabase);
    if (error) return { ok: false, error: nice(error.message) };
    revalidatePath(`/company/${slug}`);
    revalidatePath(`/edit/company/${slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That didn’t work." };
  }
}

export async function addProgram(organizationId: string, slug: string, name: string, forKids: boolean) {
  return run(slug, (s) => s.from("company_programs").insert({ organization_id: organizationId, name, for_kids: forKids, slug: "" }));
}

export async function updateProgram(id: string, slug: string, name: string, forKids: boolean) {
  return run(slug, (s) => s.from("company_programs").update({ name, for_kids: forKids }).eq("id", id));
}

export async function removeProgram(id: string, slug: string) {
  return run(slug, (s) => s.from("company_programs").delete().eq("id", id));
}
