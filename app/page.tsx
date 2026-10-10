import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PosterTile } from "@/components/PosterTile";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-12 px-4 pb-16 pt-10 md:px-8 md:pt-16">
        <section className="flex flex-col gap-5">
          <h1 className="display max-w-[900px] text-[42px] md:text-[72px]">Every local stage, every show.</h1>
          <Suspense fallback={<p className="m-0 text-lg text-muted">Counting shows…</p>}>
            <ShowCount />
          </Suspense>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/add" className="btn-primary">
              Add a production
            </Link>
            <Link href="/shows" className="btn-secondary">
              Browse shows
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="heading">Recently added</h2>
          <Suspense fallback={<p className="m-0 text-muted">Loading…</p>}>
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
    return <p className="callout m-0">Couldn&apos;t reach the database: {error.message}</p>;
  }

  const shows = count ?? 0;
  return (
    <p className="m-0 text-lg text-muted">
      <strong className="text-ink">{shows}</strong> {shows === 1 ? "show" : "shows"} in the database so far.
    </p>
  );
}

async function RecentProductions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productions")
    .select("slug, year, title_override, color_ground, show:shows(title), organization:organizations(name)")
    .order("created_at", { ascending: false })
    .limit(12);

  if (!data?.length) {
    return <p className="m-0 text-muted">Productions will appear here as members add them. Be the first.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
      {data.map((p) => {
        const title = p.title_override ?? p.show?.title ?? "Untitled";
        return (
          <PosterTile
            key={p.slug}
            href={`/production/${p.slug}`}
            title={title}
            ground={p.color_ground}
            caption={
              <>
                <span className="font-bold">
                  {title} ({p.year})
                </span>
                <span className="text-[13px] text-muted">{p.organization?.name}</span>
              </>
            }
          />
        );
      })}
    </div>
  );
}
