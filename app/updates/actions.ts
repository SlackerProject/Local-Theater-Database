"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Site updates. The database functions check that the caller is the admin.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function savePost(id: string | null, title: string, summary: string, body: string): Promise<Result<{ id: string; slug: string }>> {
  const supabase = await createClient();
  // A null id makes a new post (the generated types don't know null is allowed)
  const { data: slug, error } = await supabase.rpc("save_post", { p_id: id as string, p_title: title, p_summary: summary, p_body: body });
  if (error || !slug) return { ok: false, error: error?.message ?? "Couldn’t save." };
  const { data: post } = await supabase.from("posts").select("id").eq("slug", slug).single();
  revalidatePath("/updates");
  revalidatePath(`/updates/${slug}`);
  revalidatePath("/");
  return { ok: true, id: post?.id ?? id ?? "", slug };
}

export async function publishPost(id: string): Promise<Result<{ notified: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_post", { p_id: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/updates", "layout");
  revalidatePath("/");
  return { ok: true, notified: data ?? 0 };
}

export async function unpublishPost(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unpublish_post", { p_id: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/updates", "layout");
  revalidatePath("/");
  return { ok: true };
}

// Opening a post clears its "New update" notification
export async function markUpdateRead(postId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.rpc("mark_update_read", { p_post_id: postId });
}
