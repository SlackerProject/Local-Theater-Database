import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Search · Local Theater Database" };

const GROUPS = [
  { kind: "people", heading: "People", path: "/person" },
  { kind: "shows", heading: "Shows", path: "/show" },
  { kind: "organizations", heading: "Companies", path: "/company" },
  { kind: "locations", heading: "Venues", path: "/venue" },
] as const;

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <Suspense fallback={<SiteHeader />}>
        <HeaderWithQuery searchParams={searchParams} />
      </Suspense>
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-10 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Searching…</p>}>
          <Results searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function queryFrom(searchParams: PageProps<"/search">["searchParams"]) {
  const q = (await searchParams).q;
  return (typeof q === "string" ? q : "").trim().slice(0, 100);
}

// The header's search field shows what was searched for
async function HeaderWithQuery({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  return <SiteHeader query={await queryFrom(searchParams)} />;
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const q = await queryFrom(searchParams);
  if (q.length < 2) {
    return (
      <>
        <h1 className="display text-[40px] md:text-[56px]">Search</h1>
        <p className="m-0 text-muted">Type at least two letters of a person, show, company or venue in the search box above.</p>
      </>
    );
  }

  const supabase = await createClient();
  const results = await Promise.all(
    GROUPS.map(async (g) => {
      const { data } = await supabase.rpc("lookup", { p_kind: g.kind, p_query: q, max_results: 20 });
      return { ...g, rows: data ?? [] };
    }),
  );
  const total = results.reduce((n, g) => n + g.rows.length, 0);

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="display text-[40px] md:text-[56px]">Results for “{q}”</h1>
        <p className="m-0 text-muted">
          {total === 0
            ? "Nothing matches yet. Check the spelling, or try part of the name."
            : `${total} ${total === 1 ? "match" : "matches"}`}
        </p>
      </div>
      {results
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <section key={g.kind} className="flex flex-col">
            <h2 className="heading border-b border-rule pb-2">{g.heading}</h2>
            <ul className="m-0 list-none p-0">
              {g.rows.map((r) => (
                <li key={r.id} className="border-b border-rule">
                  <Link href={`${g.path}/${r.slug}`} className="link-quiet flex min-h-11 flex-col justify-center py-2.5">
                    <span className="font-bold">{r.label}</span>
                    {r.detail && <span className="text-sm text-muted">{r.detail}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}
