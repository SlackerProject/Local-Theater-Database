import { createClient } from "@/lib/supabase/server";
import { showColors, swatch } from "@/lib/palette";
import { mediaUrl } from "@/lib/media";

// The live Hotlist (unique visitors over the rolling 7 days), shared by
// /hotlist and the home page's "This week's Hotlist"

export type Move = { kind: "new" } | { kind: "up" | "down"; by: number } | null;

export type HotPerson = { id: string; rank: number; href: string; name: string; line: string; thumb: string | null; move: Move };
export type HotProduction = {
  id: string;
  rank: number;
  href: string;
  name: string;
  company: string;
  dates: string;
  poster: string | null;
  showTitle: string;
  background: string;
  borderColor: string;
  move: Move;
};

function movement(rank: number, lastWeek: number | null, history: boolean): Move {
  if (!history) return null;
  if (lastWeek === null) return { kind: "new" };
  if (lastWeek > rank) return { kind: "up", by: lastWeek - rank };
  if (lastWeek < rank) return { kind: "down", by: rank - lastWeek };
  return null;
}

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function getHotlist(limit: number): Promise<{ people: HotPerson[]; productions: HotProduction[] }> {
  const supabase = await createClient();
  const [{ data: hotPeople }, { data: hotProds }] = await Promise.all([
    supabase.rpc("hotlist", { p_table: "people", p_limit: limit }),
    supabase.rpc("hotlist", { p_table: "productions", p_limit: limit }),
  ]);
  const personIds = (hotPeople ?? []).map((h) => h.entity_id);
  const prodIds = (hotProds ?? []).map((h) => h.entity_id);

  const [{ data: people }, { data: prods }] = await Promise.all([
    personIds.length
      ? supabase
          .from("people")
          .select(
            `id, slug, display_name, headshot:media!people_headshot_fk(thumb_key),
             credits(kind, role_name, hidden_on_person_page, character:show_characters(name),
                     production:productions(year, opening_date, title_override, show:shows(title)))`,
          )
          .in("id", personIds)
      : Promise.resolve({ data: [] }),
    prodIds.length
      ? supabase
          .from("productions")
          .select(
            `id, slug, year, title_override, opening_date, closing_date,
             color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
             show:shows(title), organization:organizations(name), poster:media!productions_poster_fk(thumb_key)`,
          )
          .in("id", prodIds)
      : Promise.resolve({ data: [] }),
  ]);

  const peopleRows: HotPerson[] = (hotPeople ?? []).flatMap((h) => {
    const p = (people ?? []).find((x) => x.id === h.entity_id);
    if (!p) return [];
    // Their most recent credit: "Jo March in Little Women (2026)"
    const latest = (p.credits ?? [])
      .filter((c) => c.production?.show && !c.hidden_on_person_page)
      .sort((a, b) => b.production!.year - a.production!.year || (b.production!.opening_date ?? "").localeCompare(a.production!.opening_date ?? ""))[0];
    const role = latest ? (latest.character?.name ?? latest.role_name) : null;
    const line = latest
      ? `${role ? `${role} in ` : ""}${latest.production!.title_override ?? latest.production!.show!.title} (${latest.production!.year})`
      : "";
    return [
      {
        id: p.id,
        rank: h.rank,
        href: `/person/${p.slug}`,
        name: p.display_name,
        line,
        thumb: mediaUrl(p.headshot?.thumb_key),
        move: movement(h.rank, h.last_week_rank, h.has_history),
      },
    ];
  });

  const prodRows: HotProduction[] = (hotProds ?? []).flatMap((h) => {
    const p = (prods ?? []).find((x) => x.id === h.entity_id);
    if (!p?.show) return [];
    const showTitle = p.title_override ?? p.show.title;
    const sw = swatch(showColors(p));
    const dates =
      p.opening_date && p.closing_date && p.opening_date !== p.closing_date
        ? `${shortDate(p.opening_date)} – ${shortDate(p.closing_date)}`
        : p.opening_date
          ? shortDate(p.opening_date)
          : String(p.year);
    return [
      {
        id: p.id,
        rank: h.rank,
        href: `/production/${p.slug}`,
        name: `${showTitle} (${p.year})`,
        company: p.organization?.name ?? "",
        dates,
        poster: mediaUrl(p.poster?.thumb_key),
        showTitle,
        background: sw.background,
        borderColor: sw.borderColor,
        move: movement(h.rank, h.last_week_rank, h.has_history),
      },
    ];
  });

  return { people: peopleRows, productions: prodRows };
}
