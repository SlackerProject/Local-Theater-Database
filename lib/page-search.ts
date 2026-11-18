import type { createClient } from "@/lib/supabase/server";
import type { MergeTable } from "@/lib/merge";

// Find a page by name, with a short detail to tell look-alikes apart
// (used by the merge tool and by "same as another page" on the Edit pages)
export type PageHit = { id: string; label: string; slug: string; detail: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function findPages(supabase: Supabase, table: MergeTable, q: string): Promise<PageHit[]> {
  const term = q.trim().replace(/[%_,()]/g, " ");
  if (term.length < 2) return [];
  const like = `%${term}%`;
  if (table === "people") {
    const { data } = await supabase.from("people").select("id, slug, display_name, credits(count)").ilike("display_name", like).limit(10);
    return (data ?? []).map((r) => ({ id: r.id, slug: r.slug, label: r.display_name, detail: `${r.credits?.[0]?.count ?? 0} credits` }));
  }
  if (table === "shows") {
    const { data } = await supabase.from("shows").select("id, slug, title, authors, productions(count)").ilike("title", like).limit(10);
    return (data ?? []).map((r) => ({ id: r.id, slug: r.slug, label: r.title, detail: [`${r.productions?.[0]?.count ?? 0} productions`, r.authors].filter(Boolean).join(" · ") }));
  }
  if (table === "organizations") {
    const { data } = await supabase.from("organizations").select("id, slug, name, town, productions(count)").ilike("name", like).limit(10);
    return (data ?? []).map((r) => ({ id: r.id, slug: r.slug, label: r.name, detail: [r.town, `${r.productions?.[0]?.count ?? 0} productions`].filter(Boolean).join(" · ") }));
  }
  if (table === "locations") {
    const { data } = await supabase.from("locations").select("id, slug, name, street_address, town").ilike("name", like).limit(10);
    return (data ?? []).map((r) => ({ id: r.id, slug: r.slug, label: r.name, detail: [r.street_address, r.town].filter(Boolean).join(", ") }));
  }
  // Productions: by show title
  const { data } = await supabase
    .from("productions")
    .select("id, slug, year, title_override, show:shows!inner(title), organization:organizations(name), credits(count)")
    .ilike("show.title", like)
    .order("year", { ascending: false })
    .limit(10);
  return (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    label: `${r.title_override ?? r.show?.title} (${r.year})`,
    detail: [r.organization?.name, `${r.credits?.[0]?.count ?? 0} credits`].filter(Boolean).join(" · "),
  }));
}

// One page, in the same shape
export async function pageById(supabase: Supabase, table: MergeTable, id: string): Promise<PageHit | null> {
  if (table === "people") {
    const { data: r } = await supabase.from("people").select("id, slug, display_name, credits(count)").eq("id", id).maybeSingle();
    return r ? { id: r.id, slug: r.slug, label: r.display_name, detail: `${r.credits?.[0]?.count ?? 0} credits` } : null;
  }
  if (table === "shows") {
    const { data: r } = await supabase.from("shows").select("id, slug, title, authors, productions(count)").eq("id", id).maybeSingle();
    return r ? { id: r.id, slug: r.slug, label: r.title, detail: [`${r.productions?.[0]?.count ?? 0} productions`, r.authors].filter(Boolean).join(" · ") } : null;
  }
  if (table === "organizations") {
    const { data: r } = await supabase.from("organizations").select("id, slug, name, town, productions(count)").eq("id", id).maybeSingle();
    return r ? { id: r.id, slug: r.slug, label: r.name, detail: [r.town, `${r.productions?.[0]?.count ?? 0} productions`].filter(Boolean).join(" · ") } : null;
  }
  if (table === "locations") {
    const { data: r } = await supabase.from("locations").select("id, slug, name, street_address, town").eq("id", id).maybeSingle();
    return r ? { id: r.id, slug: r.slug, label: r.name, detail: [r.street_address, r.town].filter(Boolean).join(", ") } : null;
  }
  const { data: r } = await supabase
    .from("productions")
    .select("id, slug, year, title_override, show:shows(title), organization:organizations(name), credits(count)")
    .eq("id", id)
    .maybeSingle();
  return r
    ? {
        id: r.id,
        slug: r.slug,
        label: `${r.title_override ?? r.show?.title} (${r.year})`,
        detail: [r.organization?.name, `${r.credits?.[0]?.count ?? 0} credits`].filter(Boolean).join(" · "),
      }
    : null;
}
