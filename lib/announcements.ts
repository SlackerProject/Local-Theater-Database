// Follower notifications (migration 0009): "someone you follow was cast"
// and "a company you follow announced a production".

export const ANNOUNCEMENT_KINDS = ["cast_announcement", "company_announcement", "auditions_announced", "award_nomination", "award_win"] as const;
const AWARD_KINDS = ["award_nomination", "award_win"];

// What the member has already done about each announced production, so the
// buttons fit: saved it, following its auditions, and whether it's cast yet
export async function announcementContext(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  userId: string,
  productionIds: string[],
) {
  const ids = [...new Set(productionIds)];
  if (!ids.length) return { saved: new Set<string>(), auditions: new Set<string>(), cast: new Set<string>() };
  const [{ data: saved }, { data: follows }, { data: cast }] = await Promise.all([
    supabase.from("watch_list").select("production_id").eq("user_id", userId).in("production_id", ids),
    supabase.from("audition_follows").select("production_id").eq("user_id", userId).in("production_id", ids),
    supabase.from("credits").select("production_id").eq("kind", "cast").in("production_id", ids),
  ]);
  return {
    saved: new Set((saved ?? []).map((r) => r.production_id)),
    auditions: new Set((follows ?? []).map((r) => r.production_id)),
    cast: new Set((cast ?? []).map((r) => r.production_id)),
  };
}

// For supabase.from("notifications").select(...)
export const ANNOUNCEMENT_SELECT = `id, kind, status, created_at,
  production:productions(id, slug, year, title_override, show:shows(title), organization:organizations(slug, name)),
  person:people(slug, display_name),
  credit:credits(kind, role_name, character:show_characters(name)),
  award:award_entries(category:award_categories(name), ceremony:award_ceremonies(name, season))`;

type Row = {
  kind: string;
  production: {
    id: string;
    slug: string;
    year: number;
    title_override: string | null;
    show: { title: string } | null;
    organization: { slug: string; name: string } | null;
  } | null;
  person: { slug: string; display_name: string } | null;
  credit: { kind: string; role_name: string | null; character: { name: string } | null } | null;
  award?: { category: { name: string } | null; ceremony: { name: string; season: string } | null } | null;
};

// Whether to offer "Remind me about auditions": for productions that are
// still casting (or just posted dates) and that the member isn't following
export function auditionOffer(
  kind: string,
  productionId: string,
  ctx: Awaited<ReturnType<typeof announcementContext>>,
): "offer" | "following" | null {
  if (ctx.auditions.has(productionId)) return "following";
  if (AWARD_KINDS.includes(kind)) return null;
  if (kind === "auditions_announced" || (kind === "company_announcement" && !ctx.cast.has(productionId))) return "offer";
  return null;
}

// The pieces of the sentence, so pages can link each name:
// "{Name} was just cast as {Role} in {Show} ({Year}) at {Company}"
// "{Company} announced {Show} ({Year})"
// "{Name} won {Award}, {Ceremony}, for {Show}" (an honor may have no show:
// it links to the person instead)
export function announcement(n: Row) {
  const p = n.production;
  const award =
    AWARD_KINDS.includes(n.kind) && n.award && n.person
      ? {
          won: n.kind === "award_win",
          name: n.award.category?.name ?? "an award",
          ceremony: n.award.ceremony ? `${n.award.ceremony.name} ${n.award.ceremony.season}` : "",
        }
      : null;
  if (AWARD_KINDS.includes(n.kind) && !award) return null;
  if (award && !p?.show) {
    return {
      kind: n.kind as (typeof ANNOUNCEMENT_KINDS)[number],
      productionId: "",
      production: { href: `/person/${n.person!.slug}`, label: "" },
      company: null,
      person: { href: `/person/${n.person!.slug}`, label: n.person!.display_name },
      verb: "",
      role: null,
      award,
    };
  }
  if (!p?.show) return null;
  const role = n.credit?.character?.name ?? n.credit?.role_name ?? null;
  return {
    kind: n.kind as (typeof ANNOUNCEMENT_KINDS)[number],
    productionId: p.id,
    production: { href: `/production/${p.slug}`, label: `${p.title_override ?? p.show.title} (${p.year})` },
    company: p.organization ? { href: `/company/${p.organization.slug}`, label: p.organization.name } : null,
    person: n.person ? { href: `/person/${n.person.slug}`, label: n.person.display_name } : null,
    verb: n.credit?.kind === "crew" ? "joined the team" : "was just cast",
    role,
    award,
  };
}
