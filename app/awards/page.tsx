import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { AWARD_SELECT, productionTitle, type AwardRow } from "@/lib/awards";
import { showColors, swatch } from "@/lib/palette";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { groupAwards, ResultMark, statusOf } from "@/components/AwardList";

export const metadata: Metadata = { title: "Awards" };

export default function AwardsPage({ searchParams }: PageProps<"/awards">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Awards searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

// The arrow on each season and award: points right when closed, down when open
function Arrow({ group }: { group: "cer" | "cat" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`size-4 shrink-0 fill-none stroke-current transition-transform ${group === "cer" ? "group-open/cer:rotate-90" : "group-open/cat:rotate-90"}`}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  );
}

const summary = "flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden";

type Ceremony = { id: string; slug: string; name: string; season: string; year: number };

// Every ceremony, newest first. The newest (or the one a link asked for) starts
// open; each season and each award opens and closes with its arrow.
async function Awards({ searchParams }: Pick<PageProps<"/awards">, "searchParams">) {
  const supabase = await createClient();
  const [{ ceremony: wanted }, { data: ceremonyRows }, user] = await Promise.all([
    searchParams,
    supabase.from("award_ceremonies").select("id, slug, name, season, year").order("year", { ascending: false }).order("name"),
    getCurrentUser(),
  ]);
  const canAdd = hasRole(user, "moderator");
  const ids = (ceremonyRows ?? []).map((c) => c.id);

  const [{ data: entries }, { data: order }] = ids.length
    ? await Promise.all([
        supabase.from("award_entries").select(`ceremony_id, category_id, ${AWARD_SELECT}`).in("ceremony_id", ids),
        supabase.from("award_ceremony_categories").select("ceremony_id, category_id, sort_order").in("ceremony_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const rows = (entries ?? []) as unknown as (AwardRow & { ceremony_id: string; category_id: string })[];
  const sortOf = new Map((order ?? []).map((o) => [`${o.ceremony_id}:${o.category_id}`, o.sort_order]));

  // Only ceremonies with something entered
  const ceremonies = ((ceremonyRows ?? []) as Ceremony[]).filter((c) => rows.some((r) => r.ceremony_id === c.id));
  const openSlug = ceremonies.some((c) => c.slug === wanted) ? wanted : ceremonies[0]?.slug;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[40px] md:text-[56px]">Awards</h1>
        {canAdd && (
          <Link href="/awards/add" className="btn-primary">
            Add awards
          </Link>
        )}
      </div>

      {!ceremonies.length ? (
        <p className="m-0 text-muted">No awards yet.</p>
      ) : (
        <div className="flex flex-col border-t-2 border-ink">
          {ceremonies.map((c) => {
            // Its awards in the ceremony's order; Consultant Choice after the rest
            const mine = rows.filter((r) => r.ceremony_id === c.id);
            const cats = [...new Map(mine.map((r) => [r.category_id, r.category])).entries()].sort(
              ([a], [b]) => (sortOf.get(`${c.id}:${a}`) ?? 0) - (sortOf.get(`${c.id}:${b}`) ?? 0),
            );
            const regular = cats.filter(([, k]) => !k?.consultant_choice);
            const consultant = cats.filter(([, k]) => k?.consultant_choice);
            const list = (group: typeof cats) =>
              group.map(([id, k]) => <AwardSection key={id} name={k?.name ?? "Award"} rows={mine.filter((r) => r.category_id === id)} />);
            return (
              <details key={c.id} id={c.slug} open={c.slug === openSlug} className="group/cer scroll-mt-24 border-b border-rule">
                <summary className={`${summary} min-h-16 py-3`}>
                  <Arrow group="cer" />
                  <h2 className="heading m-0">
                    {c.name} {c.season}
                  </h2>
                </summary>
                <div className="flex flex-col gap-1 pb-8 pl-[26px]">
                  {list(regular)}
                  {consultant.length > 0 && (
                    <>
                      <h3 className="mb-1 mt-6 text-[13px] font-bold uppercase tracking-[0.06em] text-muted">Consultant Choice</h3>
                      {list(consultant)}
                    </>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}

// One award: its nominees (winner first, with a gold star) or its recipients
function AwardSection({ name, rows }: { name: string; rows: AwardRow[] }) {
  const lines = groupAwards(rows).sort((a, b) => Number(b.first.result === "won") - Number(a.first.result === "won"));
  const [main, ...rest] = name.split(" - ");
  return (
    <details open className="group/cat border-b border-rule">
      <summary className={`${summary} min-h-12 py-2`}>
        <Arrow group="cat" />
        <h3 className="m-0 text-[17px] font-semibold">
          {main}
          {rest.length > 0 && <span className="font-normal text-muted"> · {rest.join(" · ")}</span>}
        </h3>
      </summary>
      <ul className="m-0 flex list-none flex-col gap-3 pb-4 pl-[26px] pt-1">
        {lines.map(({ key, first: e, people }) => {
          const status = statusOf(e);
          const sw = e.production ? swatch(showColors(e.production)) : null;
          const show = e.production && (
            <Link href={`/production/${e.production.slug}`} className={people.length ? "link-quiet inline-flex items-center gap-2" : "font-semibold"}>
              {people.length > 0 && sw && (
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border" style={{ background: sw.background, borderColor: sw.borderColor }} />
              )}
              {productionTitle(e)}
            </Link>
          );
          return (
            <li key={key} className="flex gap-2 text-[15px] leading-snug">
              <ResultMark status={status} />
              <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  {people.length ? (
                    <span className="font-semibold">
                      {people.map((p, i) => (
                        <span key={`${p.slug ?? p.name}-${i}`}>
                          {i > 0 && (i === people.length - 1 ? " & " : ", ")}
                          {p.slug ? <Link href={`/person/${p.slug}`}>{p.name}</Link> : p.name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    (show ?? <span className="font-semibold">{e.organization?.name}</span>)
                  )}
                  {status === "won" && <span className="text-[14px] font-semibold text-gold-ink">Winner</span>}
                </span>
                {people.length > 0 && show && <span className="text-[14px] text-muted">{show}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
