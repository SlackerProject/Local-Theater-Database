import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { showColors, swatch } from "@/lib/palette";
import { mediaUrl } from "@/lib/media";
import { currentTime, localDate } from "@/lib/calendar";

// Data for the home pages (DESIGN.md "Home page")

export type Tile = {
  id: string;
  href: string;
  title: string; // "Little Women (2026)"
  showTitle: string;
  line: string; //  "Walpole Footlighters · Oct 30 – Nov 15"
  poster: string | null;
  background: string;
  borderColor: string;
};

export const TILE_SELECT = `id, slug, year, title_override, opening_date, closing_date, is_hidden, created_at,
  color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
  show:shows(title), organization:organizations(name), poster:media!productions_poster_fk(thumb_key)`;

type ProdRow = {
  id: string;
  slug: string;
  year: number;
  title_override: string | null;
  opening_date: string | null;
  closing_date: string | null;
  color_ground: string | null;
  color_ground_2: string | null;
  color_ink: string | null;
  color_soft: string | null;
  color_accent: string | null;
  color_edge: string | null;
  show: { title: string } | null;
  organization: { name: string } | null;
  poster: { thumb_key: string | null } | null;
};

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function toTile(p: ProdRow): Tile {
  const showTitle = p.title_override ?? p.show?.title ?? "Untitled";
  const sw = swatch(showColors(p));
  const dates =
    p.opening_date && p.closing_date && p.opening_date !== p.closing_date
      ? `${shortDate(p.opening_date)} – ${shortDate(p.closing_date)}`
      : p.opening_date
        ? shortDate(p.opening_date)
        : "";
  return {
    id: p.id,
    href: `/production/${p.slug}`,
    title: `${showTitle} (${p.year})`,
    showTitle,
    line: [p.organization?.name, dates].filter(Boolean).join(" · "),
    poster: mediaUrl(p.poster?.thumb_key),
    background: sw.background,
    borderColor: sw.borderColor,
  };
}

const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

// Running now or opening in the next 60 days, soonest first (up to 8);
// topped up to 4 with the most recently added productions
export async function playingNow(): Promise<Tile[]> {
  await connection(); // "today" is read per request, never baked in at build time
  const supabase = await createClient();
  const today = localDate(currentTime());
  const { data: running } = await supabase
    .from("productions")
    .select(TILE_SELECT)
    .eq("is_hidden", false)
    .gte("closing_date", today)
    .lte("opening_date", addDays(today, 60))
    .order("opening_date", { ascending: true })
    .limit(8);
  const tiles = ((running ?? []) as unknown as ProdRow[]).map(toTile);
  if (tiles.length < 4) {
    const { data: recent } = await supabase
      .from("productions")
      .select(TILE_SELECT)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(8);
    for (const p of (recent ?? []) as unknown as ProdRow[]) {
      if (tiles.length >= 4) break;
      if (!tiles.some((t) => t.id === p.id)) tiles.push(toTile(p));
    }
  }
  return tiles;
}

// Upcoming runs (not yet closed) involving people or companies the member
// follows, soonest first
export async function comingUpFromFollows(userId: string): Promise<Tile[]> {
  await connection();
  const supabase = await createClient();
  const today = localDate(currentTime());
  const { data: follows } = await supabase.from("follows").select("person_id, organization_id").eq("user_id", userId);
  const personIds = (follows ?? []).flatMap((f) => (f.person_id ? [f.person_id] : []));
  const orgIds = (follows ?? []).flatMap((f) => (f.organization_id ? [f.organization_id] : []));
  if (!personIds.length && !orgIds.length) return [];

  const [{ data: byPeople }, { data: byOrgs }] = await Promise.all([
    personIds.length
      ? supabase.from("credits").select(`production:productions!inner(${TILE_SELECT})`).in("person_id", personIds).gte("production.closing_date", today)
      : Promise.resolve({ data: [] }),
    orgIds.length
      ? supabase.from("productions").select(TILE_SELECT).in("organization_id", orgIds).gte("closing_date", today)
      : Promise.resolve({ data: [] }),
  ]);
  const rows = [
    ...((byPeople ?? []) as unknown as { production: ProdRow & { is_hidden: boolean } }[]).map((c) => c.production),
    ...((byOrgs ?? []) as unknown as (ProdRow & { is_hidden: boolean })[]),
  ].filter((p) => p && !p.is_hidden);
  const unique = [...new Map(rows.map((p) => [p.id, p])).values()].sort((a, b) =>
    (a.opening_date ?? "9999").localeCompare(b.opening_date ?? "9999"),
  );
  return unique.slice(0, 8).map(toTile);
}

export async function homeCounts() {
  const supabase = await createClient();
  const [{ data: setting }, { data: counts }] = await Promise.all([
    supabase.from("site_settings").select("value").eq("key", "home_counts").maybeSingle(),
    supabase.rpc("site_counts"),
  ]);
  const show = !!(setting?.value as { show?: boolean } | null)?.show;
  return { show, counts: counts?.[0] ?? null };
}
