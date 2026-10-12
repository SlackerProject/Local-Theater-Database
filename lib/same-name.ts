import type { createClient } from "@/lib/supabase/server";
import { personNameKey, type SameNameMatch } from "@/lib/submission";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// For the moderators' review screens: who's already on the site with each
// of these names, keyed by personNameKey(). A "new" person in a pending
// submission may have been added since (by another submission), so this is
// checked when the moderator looks, not when the contributor submitted.
export async function sameNameMatches(supabase: Supabase, names: string[]): Promise<Record<string, SameNameMatch[]>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabase.rpc("find_people_by_names", { p_names: unique });
  const out: Record<string, SameNameMatch[]> = {};
  for (const r of data ?? []) {
    (out[r.name_key] ??= []).push({ id: r.id, label: r.display_name, slug: r.slug, detail: r.detail });
  }
  return out;
}

export { personNameKey };
