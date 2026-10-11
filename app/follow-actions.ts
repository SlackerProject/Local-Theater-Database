"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Following, Want to see / Going / Seen, and dismissing announcements.
// The follows and watch_list tables only let members touch their own rows
// (row-level security), so these actions just pass the member's choice on.

export type Result = { ok: true } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

function done(paths: string[]): Result {
  for (const p of paths) revalidatePath(p);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Follow a person or a company
// ---------------------------------------------------------------------
export async function setFollow(
  target: { personId: string } | { organizationId: string },
  follow: boolean,
  path: string,
): Promise<Result> {
  const { supabase, userId } = await signedIn();
  if (!userId) return fail("Sign in to follow.");
  const row = {
    user_id: userId,
    person_id: "personId" in target ? target.personId : null,
    organization_id: "organizationId" in target ? target.organizationId : null,
  };
  const column = "personId" in target ? "person_id" : "organization_id";
  const id = "personId" in target ? target.personId : target.organizationId;
  if (follow) {
    const { error } = await supabase.from("follows").insert(row);
    if (error && !/duplicate key/.test(error.message)) return fail(error.message);
  } else {
    const { error } = await supabase.from("follows").delete().eq("user_id", userId).eq(column, id);
    if (error) return fail(error.message);
  }
  return done([path, "/calendar"]);
}

// ---------------------------------------------------------------------
// Want to see, I'm going (one performance), Seen, or remove
// ---------------------------------------------------------------------
export type WatchChoice =
  | { status: "want_to_see" }
  | { status: "going"; performanceId: string }
  | { status: "seen" }
  | { status: "none" };

export async function setWatch(productionId: string, choice: WatchChoice, path: string): Promise<Result> {
  const { supabase, userId } = await signedIn();
  if (!userId) return fail("Sign in to save shows.");
  if (choice.status === "none") {
    const { error } = await supabase.from("watch_list").delete().eq("user_id", userId).eq("production_id", productionId);
    if (error) return fail(error.message);
  } else {
    // Seen keeps the night you were going, if there was one
    let performanceId: string | null = null;
    if (choice.status === "going") performanceId = choice.performanceId;
    if (choice.status === "seen") {
      const { data } = await supabase
        .from("watch_list")
        .select("performance_id")
        .eq("user_id", userId)
        .eq("production_id", productionId)
        .maybeSingle();
      performanceId = data?.performance_id ?? null;
    }
    const { error } = await supabase
      .from("watch_list")
      .upsert({ user_id: userId, production_id: productionId, status: choice.status, performance_id: performanceId });
    if (error) return fail(error.message);
  }
  return done([path, "/calendar", "/notifications"]);
}

// ---------------------------------------------------------------------
// Announcements: "Want to see" right from the notification, or dismiss
// ---------------------------------------------------------------------
export async function dismissNotification(id: string): Promise<Result> {
  const { supabase, userId } = await signedIn();
  if (!userId) return fail("Sign in first.");
  const { error } = await supabase.rpc("dismiss_notification", { p_id: id });
  return error ? fail(error.message) : done(["/notifications", "/calendar"]);
}

export async function wantToSeeFromNotification(id: string, productionId: string): Promise<Result> {
  const { supabase, userId } = await signedIn();
  if (!userId) return fail("Sign in first.");
  // Don't overwrite Going or Seen with Want to see
  const { data: existing } = await supabase
    .from("watch_list")
    .select("status")
    .eq("user_id", userId)
    .eq("production_id", productionId)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase
      .from("watch_list")
      .insert({ user_id: userId, production_id: productionId, status: "want_to_see" });
    if (error) return fail(error.message);
  }
  await supabase.rpc("dismiss_notification", { p_id: id });
  return done(["/notifications", "/calendar"]);
}

// ---------------------------------------------------------------------
// The private calendar subscription link
// ---------------------------------------------------------------------
export async function calendarFeedToken(reset: boolean): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { supabase, userId } = await signedIn();
  if (!userId) return { ok: false, error: "Sign in first." };
  const { data, error } = await supabase.rpc("my_calendar_feed", { p_reset: reset });
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn’t make the link." };
  return { ok: true, token: data };
}
