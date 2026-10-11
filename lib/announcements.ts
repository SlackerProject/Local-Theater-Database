// Follower notifications (migration 0009): "someone you follow was cast"
// and "a company you follow announced a production".

export const ANNOUNCEMENT_KINDS = ["cast_announcement", "company_announcement"] as const;

// For supabase.from("notifications").select(...)
export const ANNOUNCEMENT_SELECT = `id, kind, status, created_at,
  production:productions(id, slug, year, title_override, show:shows(title), organization:organizations(slug, name)),
  person:people(slug, display_name),
  credit:credits(kind, role_name, character:show_characters(name))`;

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
};

// The pieces of the sentence, so pages can link each name:
// "{Name} was just cast as {Role} in {Show} ({Year}) at {Company}"
// "{Company} announced {Show} ({Year})"
export function announcement(n: Row) {
  const p = n.production;
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
  };
}
