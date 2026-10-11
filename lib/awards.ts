// Award nominations and wins (DESIGN.md "Awards (EMACT)")

export const AWARD_SELECT = `id, award_year, result,
  category:award_categories(id, name, body:award_bodies(name)),
  production:productions(id, slug, year, title_override, color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
                         show:shows(title)),
  person:people(slug, display_name, is_hidden),
  credit:credits(role_name, character:show_characters(name))`;

export type AwardRow = {
  id: string;
  award_year: number;
  result: "nominated" | "won";
  category: { id: string; name: string; body: { name: string } | null } | null;
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
  credit: { role_name: string | null; character: { name: string } | null } | null;
};

// "Won, Best Actress in a Musical, EMACT awards 2026"
export function awardSentence(a: AwardRow) {
  return `${a.result === "won" ? "Won" : "Nominated"}, ${a.category?.name ?? "an award"}, ${a.category?.body?.name ?? "EMACT"} awards ${a.award_year}`;
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
