import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { showColors, swatch } from "@/lib/palette";
import { mediaUrl } from "@/lib/media";
import { currentTime, localDay, localTime } from "@/lib/calendar";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Auditions" };

// Audition finder, first version: every production with auditions still
// ahead, soonest first
export default function AuditionsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <div className="flex flex-col gap-2">
          <h1 className="display text-[40px] md:text-[56px]">Auditions</h1>
          <p className="m-0 text-muted">
            Productions with auditions coming up, soonest first. Open one to see every session and press “Remind me about
            auditions”.
          </p>
        </div>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <List />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function List() {
  await connection();
  const supabase = await createClient();
  const now = currentTime().toISOString();
  const { data } = await supabase
    .from("auditions")
    .select(
      `id, starts_at, ends_at, label, place, venue:locations(name, town),
       production:productions!inner(id, slug, year, title_override, is_hidden,
         color_ground, color_ground_2, color_ink, color_soft, color_accent, color_edge,
         show:shows(title), organization:organizations(name, town), poster:media!productions_poster_fk(thumb_key))`,
    )
    .gte("starts_at", now)
    .eq("production.is_hidden", false)
    .order("starts_at")
    .limit(500);

  // One entry per production, at its next session
  const byProduction = new Map<string, { next: NonNullable<typeof data>[number]; count: number }>();
  for (const a of data ?? []) {
    if (!a.production?.show) continue;
    const entry = byProduction.get(a.production.id);
    if (entry) entry.count++;
    else byProduction.set(a.production.id, { next: a, count: 1 });
  }
  const rows = [...byProduction.values()];

  if (!rows.length) {
    return (
      <p className="m-0 text-muted">
        No auditions are listed right now. When a company posts audition dates on a production’s page, they’ll appear here.
      </p>
    );
  }

  return (
    <ol className="m-0 list-none border-t border-rule p-0">
      {rows.map(({ next: a, count }) => {
        const p = a.production!;
        const title = p.title_override ?? p.show!.title;
        const sw = swatch(showColors(p));
        const poster = mediaUrl(p.poster?.thumb_key);
        const where = a.venue ? [a.venue.name, a.venue.town].filter(Boolean).join(", ") : a.place;
        return (
          <li key={p.id}>
            <Link href={`/production/${p.slug}`} className="link-quiet flex items-center gap-4 border-b border-rule py-3.5">
              <span aria-hidden="true" className="flex h-[72px] w-[58px] flex-none items-center overflow-hidden rounded-[4px] border" style={{ background: sw.background, borderColor: sw.borderColor }}>
                {poster ? (
                  <img src={poster} alt="" className="block h-full w-full object-contain" />
                ) : (
                  <span className="self-end p-1 text-[9px] font-extrabold leading-tight text-muted">{title}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-bold">
                  {title} ({p.year})
                </span>
                {p.organization && <span className="text-sm text-muted">{[p.organization.name, p.organization.town].filter(Boolean).join(", ")}</span>}
                <span className="text-[15px]">
                  <strong>{a.label ?? "Auditions"}:</strong> {localDay(a.starts_at)} · {localTime(a.starts_at)}
                  {where && <span className="text-muted"> · {where}</span>}
                </span>
                {count > 1 && <span className="text-sm text-muted">+ {count - 1} more {count === 2 ? "session" : "sessions"}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
