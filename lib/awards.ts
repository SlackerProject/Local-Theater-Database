// Award nominations and wins (DESIGN.md "Awards (EMACT)")

export const AWARD_SELECT = `id, nomination_id, award_year, result, source_url,
  ceremony:award_ceremonies(slug, name, season),
  organization:organizations(slug, name),
  category:award_categories(id, name, kind, section, consultant_choice, whole_cast, body:award_bodies(name)),
  production:productions(id, slug, year, title_override, color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
                         show:shows(title)),
  person:people(slug, display_name, is_hidden),
  credit:credits(role_name, is_young_performer, character:show_characters(name))`;

export type AwardRow = {
  id: string;
  award_year: number;
  result: "nominated" | "won";
  nomination_id: string;
  source_url: string;
  ceremony: { slug: string; name: string; season: string } | null;
  organization: { slug: string; name: string } | null;
  category: { id: string; name: string; kind: string; section: string | null; consultant_choice: boolean; whole_cast: boolean; body: { name: string } | null } | null;
  production: {
    id: string;
    slug: string;
    year: number;
    title_override: string | null;
    color_ground: string | null;
    color_ground_2: string | null;
    color_ink: string | null;
    color_soft: string | null;
    color_accent: string | null;
    color_edge: string | null;
    show: { title: string } | null;
  } | null;
  person: { slug: string; display_name: string; is_hidden: boolean } | null;
  credit: { role_name: string | null; is_young_performer: boolean; character: { name: string } | null } | null;
};

// The ceremony, e.g. "DASH Awards 2025–26"
export function ceremonyName(a: AwardRow) {
  return a.ceremony ? `${a.ceremony.name} ${a.ceremony.season}` : `${a.category?.body?.name ?? "Awards"} ${a.award_year}`;
}

// The ceremony on the Awards page, opened and scrolled to
export const ceremonyHref = (slug: string) => `/awards?ceremony=${slug}#${slug}`;

// "Won, Direction Musical, DASH Awards 2025–26"
// A young performer is never named: "Young performer, nominated for Youth Performer Musical"
export function awardSentence(a: AwardRow) {
  if (a.credit?.is_young_performer || a.category?.kind === "youth") {
    return `Young performer, ${a.result === "won" ? "won" : "nominated for"} ${a.category?.name ?? "an award"} (${ceremonyName(a)})`;
  }
  return `${a.result === "won" ? "Won" : "Nominated"}, ${a.category?.name ?? "an award"}, ${ceremonyName(a)}`;
}

export function productionTitle(a: AwardRow) {
  return a.production ? `${a.production.title_override ?? a.production.show?.title} (${a.production.year})` : "";
}

// Newest year first; wins before nominations
export function sortAwards(rows: AwardRow[]) {
  return [...rows].sort(
    (a, b) => b.award_year - a.award_year || Number(b.result === "won") - Number(a.result === "won") || (a.category?.name ?? "").localeCompare(b.category?.name ?? ""),
  );
}
