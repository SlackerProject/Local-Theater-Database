import { createClient } from "@/lib/supabase/server";

// Site updates (posts): helpers shared by the home page and /updates

export const postDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : "";

export async function latestUpdates(limit: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("id, slug, title, summary, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
