import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { AWARD_SELECT, productionTitle, type AwardRow } from "@/lib/awards";
import { showColors, swatch } from "@/lib/palette";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

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

function Check() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#141414" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

async function Awards({ searchParams }: Pick<PageProps<"/awards">, "searchParams">) {
  const supabase = await createClient();
  const [{ year: yearParam }, { data: yearRows }, user] = await Promise.all([
    searchParams,
    supabase.from("award_entries").select("award_year").order("award_year", { ascending: false }),
    getCurrentUser(),
  ]);
  const years = [...new Set((yearRows ?? []).map((r) => r.award_year))];
  const year = typeof yearParam === "string" && years.includes(Number(yearParam)) ? Number(yearParam) : years[0];
  const canAdd = hasRole(user, "trusted");

  const { data } = year
    ? await supabase.from("award_entries").select(AWARD_SELECT).eq("award_year", year)
    : { data: [] };
  const rows = (data ?? []) as unknown as AwardRow[];

  // Group by awards (e.g. EMACT), then category; winners first
  const groups = new Map<string, Map<string, AwardRow[]>>();
  for (const r of rows) {
    const body = r.category?.body?.name ?? "Awards";
    const cat = r.category?.name ?? "Other";
    const byCat = groups.get(body) ?? new Map<string, AwardRow[]>();
    byCat.set(cat, [...(byCat.get(cat) ?? []), r]);
    groups.set(body, byCat);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="display text-[40px] md:text-[56px]">Awards{year ? ` ${year}` : ""}</h1>
          <p className="m-0 text-muted">Nominations and wins for local productions, by year and category.</p>
        </div>
        {canAdd && (
          <Link href="/awards/add" className="btn-primary">
            Add awards
          </Link>
        )}
      </div>

      {years.length > 1 && (
        <nav aria-label="Award years" className="flex flex-wrap gap-2">
          {years.map((y) => (
            <Link
              key={y}
              href={`/awards?year=${y}`}
              aria-current={y === year ? "page" : undefined}
              className={`link-quiet inline-flex min-h-11 items-center rounded-lg border-[1.5px] px-4 font-semibold ${y === year ? "border-ink bg-ink text-white" : "border-rule"}`}
            >
              {y}
            </Link>
          ))}
        </nav>
      )}

      {!year ? (
        <p className="m-0 text-muted">
          Award nominations and wins will appear here once they’re added{canAdd ? ". Use Add awards to enter them." : "."}
        </p>
      ) : (
        [...groups].map(([body, byCat]) => (
          <section key={body} className="flex flex-col gap-8">
            <h2 className="heading">{body} awards</h2>
            {[...byCat]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cat, entries]) => (
                <section key={cat} className="flex flex-col">
                  <h3 className="subheading mb-1">{cat}</h3>
                  <ul className="m-0 list-none border-t border-rule p-0">
                    {[...entries]
                      .sort((a, b) => Number(b.result === "won") - Number(a.result === "won"))
                      .map((e) => {
                        const sw = e.production ? swatch(showColors(e.production)) : null;
                        const role = e.credit?.character?.name ?? e.credit?.role_name;
                        const person = e.person && !e.person.is_hidden ? e.person : null;
                        return (
                          <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-rule py-3">
                            <span className="flex flex-wrap items-center gap-x-2">
                              {person ? (
                                <Link href={`/person/${person.slug}`} className="font-bold">
                                  {person.display_name}
                                </Link>
                              ) : (
                                e.production && (
                                  <Link href={`/production/${e.production.slug}`} className="font-bold">
                                    {productionTitle(e)}
                                  </Link>
                                )
                              )}
                              {e.result === "won" && (
                                <span className="inline-flex items-center gap-1 font-bold">
                                  <Check /> Winner
                                </span>
                              )}
                              {person && role && <span className="text-muted">as {role}</span>}
                            </span>
                            {person && e.production && sw && (
                              <Link href={`/production/${e.production.slug}`} className="link-quiet inline-flex items-center gap-2">
                                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border" style={{ background: sw.background, borderColor: sw.borderColor }} />
                                {productionTitle(e)}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </section>
              ))}
          </section>
        ))
      )}
    </>
  );
}
