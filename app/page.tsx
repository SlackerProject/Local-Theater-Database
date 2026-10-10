import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-10 px-4 py-10 sm:px-8 sm:py-14">
        <section className="overflow-hidden rounded-[14px] border border-rule bg-surface">
          <div className="h-2 bg-marquee" />
          <div className="flex flex-col gap-6 px-6 py-10 sm:px-10">
            <div className="flex flex-col gap-3">
              <p className="eyebrow m-0 text-accent">Local Theater Database</p>
              <h1 className="m-0 font-serif text-4xl font-normal leading-tight sm:text-5xl">
                Every local stage, every show.
              </h1>
            </div>
            <Suspense fallback={<p className="m-0 text-muted">Checking the database…</p>}>
              <ShowCount />
            </Suspense>
            <div>
              <Link
                href="/add"
                className="inline-flex h-12 items-center rounded-full bg-accent px-6 font-semibold text-white no-underline"
              >
                Add a production
              </Link>
            </div>
          </div>
        </section>

        <section className="flex flex-col">
          <h2 className="m-0 border-b-2 border-ink pb-2 font-serif text-[34px] font-normal">Recently added</h2>
          <Suspense fallback={<p className="text-muted">Loading…</p>}>
            <RecentProductions />
          </Suspense>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

async function ShowCount() {
  const supabase = await createClient();
  const { count, error } = await supabase.from("shows").select("*", { count: "exact", head: true });

  if (error) {
    return <p className="m-0 text-accent">Couldn&apos;t reach the database: {error.message}</p>;
  }

  const shows = count ?? 0;
  return (
    <p className="m-0 text-lg">
      <span className="font-serif text-5xl text-accent">{shows}</span>{" "}
      <span className="text-muted">{shows === 1 ? "show" : "shows"} in the database</span>
    </p>
  );
}

async function RecentProductions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productions")
    .select("slug, year, title_override, show:shows(title, type), organization:organizations(name)")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data?.length) {
    return <p className="text-muted">Nothing yet. Be the first to add a production.</p>;
  }

  return (
    <ul className="m-0 list-none p-0">
      {data.map((p) => (
        <li key={p.slug} className="flex flex-col gap-0.5 border-b border-rule py-3.5">
          <Link href={`/production/${p.slug}`} className="font-serif text-[22px] text-ink no-underline">
            {p.title_override ?? p.show?.title} ({p.year})
          </Link>
          <span className="text-[15px] text-muted">{p.organization?.name}</span>
        </li>
      ))}
    </ul>
  );
}
