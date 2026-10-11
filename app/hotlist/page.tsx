import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { showColors, swatch } from "@/lib/palette";
import { mediaUrl } from "@/lib/media";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Hotlist · Local Theater Database" };

export default function HotlistPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <div className="flex flex-col gap-2">
          <h1 className="display text-[40px] md:text-[56px]">Hotlist</h1>
          <p className="m-0 text-muted">The most-visited pages this week, counted once per visitor per day.</p>
        </div>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Lists />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

type Row = { id: string; rank: number; href: string; name: string; line: string; image: React.ReactNode; move: Move };
type Move = { kind: "new" } | { kind: "up" | "down"; by: number } | null;

function movement(rank: number, lastWeek: number | null, history: boolean): Move {
  if (!history) return null;
  if (lastWeek === null) return { kind: "new" };
  if (lastWeek > rank) return { kind: "up", by: lastWeek - rank };
  if (lastWeek < rank) return { kind: "down", by: rank - lastWeek };
  return null;
}

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

async function Lists() {
  const supabase = await createClient();
  const [{ data: hotPeople }, { data: hotProds }] = await Promise.all([
    supabase.rpc("hotlist", { p_table: "people", p_limit: 25 }),
    supabase.rpc("hotlist", { p_table: "productions", p_limit: 25 }),
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

  const peopleRows: Row[] = (hotPeople ?? []).flatMap((h) => {
    const p = (people ?? []).find((x) => x.id === h.entity_id);
    if (!p) return [];
    // Their most recent credit
    const latest = (p.credits ?? [])
      .filter((c) => c.production?.show && !c.hidden_on_person_page)
      .sort((a, b) => b.production!.year - a.production!.year || (b.production!.opening_date ?? "").localeCompare(a.production!.opening_date ?? ""))[0];
    const role = latest ? (latest.character?.name ?? latest.role_name) : null;
    const line = latest
      ? `${role ? `${role} in ` : ""}${latest.production!.title_override ?? latest.production!.show!.title} (${latest.production!.year})`
      : "";
    const thumb = mediaUrl(p.headshot?.thumb_key);
    return [
      {
        id: p.id,
        rank: h.rank,
        href: `/person/${p.slug}`,
        name: p.display_name,
        line,
        move: movement(h.rank, h.last_week_rank, h.has_history),
        image: thumb ? (
          <img src={thumb} alt="" className="h-14 w-14 flex-none rounded-full bg-soft object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-soft text-xl font-bold text-muted">
            {p.display_name.charAt(0).toUpperCase()}
          </span>
        ),
      },
    ];
  });

  const prodRows: Row[] = (hotProds ?? []).flatMap((h) => {
    const p = (prods ?? []).find((x) => x.id === h.entity_id);
    if (!p?.show) return [];
    const title = p.title_override ?? p.show.title;
    const sw = swatch(showColors(p));
    const poster = mediaUrl(p.poster?.thumb_key);
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
        name: `${title} (${p.year})`,
        line: [p.organization?.name, dates].filter(Boolean).join(" · "),
        move: movement(h.rank, h.last_week_rank, h.has_history),
        image: (
          <span aria-hidden="true" className="flex h-[60px] w-12 flex-none overflow-hidden rounded-[4px] border" style={{ background: sw.background, borderColor: sw.borderColor }}>
            {poster ? (
              <img src={poster} alt="" className="block h-full w-full object-contain" />
            ) : (
              <span className="self-end p-1 text-[9px] font-extrabold leading-tight text-muted">{title}</span>
            )}
          </span>
        ),
      },
    ];
  });

  return (
    <div className="flex flex-wrap items-start gap-12">
      <List title="People" rows={peopleRows} empty="People pages visited this week will appear here." />
      <List title="Productions" rows={prodRows} empty="Production pages visited this week will appear here." />
    </div>
  );
}

function List({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <section className="flex min-w-0 flex-[1_1_420px] flex-col">
      <h2 className="heading mb-1">{title}</h2>
      {rows.length === 0 ? (
        <p className="m-0 text-muted">{empty}</p>
      ) : (
        <ol className="m-0 list-none border-t border-rule p-0">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="link-quiet flex items-center gap-4 border-b border-rule py-3">
                <span className="w-10 flex-none text-right text-[28px] font-extrabold tabular-nums leading-none text-muted">{r.rank}</span>
                {r.image}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-bold">{r.name}</span>
                  {r.line && <span className="truncate text-sm text-muted">{r.line}</span>}
                </span>
                <MoveMarker move={r.move} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Compared with last week, when there's a week of history
function MoveMarker({ move }: { move: Move }) {
  if (!move) return null;
  if (move.kind === "new") return <span className="flex-none rounded bg-soft px-1.5 text-[13px] font-bold">New</span>;
  return (
    <span className="inline-flex flex-none items-center gap-0.5 text-[13px] font-semibold text-muted" title={`${move.kind === "up" ? "Up" : "Down"} ${move.by} since last week`}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d={move.kind === "up" ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M5 12l7 7 7-7"} />
      </svg>
      {move.by}
      <span className="sr-only">{move.kind === "up" ? " places up" : " places down"} since last week</span>
    </span>
  );
}
