import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentTime } from "@/lib/calendar";
import { showColors, swatch } from "@/lib/palette";
import { mediaUrl } from "@/lib/media";

// The live Hotlist of productions (unique visitors over the rolling 7
// days), shared by /hotlist and the home page's Hotlist box.
// People aren't ranked publicly (views of person pages are still counted
// in case that changes).

export type Move = { kind: "new" } | { kind: "up" | "down"; by: number } | null;

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

// "Updated 2:14 PM": the list is worked out fresh for each visit (pages
// are kept at most a minute), so this is when the visitor's copy was made
export async function hotlistUpdated() {
  await connection();
  const time = currentTime().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `Updated ${time}`;
}

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export async function getHotProductions(limit: number): Promise<HotProduction[]> {
  const supabase = await createClient();
  const { data: hot } = await supabase.rpc("hotlist", { p_table: "productions", p_limit: limit });
  const ids = (hot ?? []).map((h) => h.entity_id);
  if (!ids.length) return [];
  const { data: prods } = await supabase
    .from("productions")
    .select(
      `id, slug, year, title_override, opening_date, closing_date,
       color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
       show:shows(title), organization:organizations(name), poster:media!productions_poster_fk(thumb_key)`,
    )
    .in("id", ids);

  return (hot ?? []).flatMap((h) => {
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
}
