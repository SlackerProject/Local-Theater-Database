import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Table = "people" | "shows" | "organizations" | "locations" | "productions";
const PATH: Record<Table, string> = { people: "person", shows: "show", organizations: "company", locations: "venue", productions: "production" };

// A page that isn't here: if a moderator merged it into another, its old
// address forwards there; otherwise "not found"
export async function forwardIfMerged(table: Table, slug: string): Promise<never> {
  const supabase = await createClient();
  const { data: keptId } = await supabase.rpc("merged_into", { p_table: table, p_slug: decodeURIComponent(slug) });
  if (keptId) {
    const { data } = await supabase.from(table).select("slug").eq("id", keptId).maybeSingle();
    const kept = data as { slug: string } | null;
    if (kept?.slug) permanentRedirect(`/${PATH[table]}/${kept.slug}`);
  }
  notFound();
}
