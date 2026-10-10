import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SHOW_TYPES } from "@/lib/submission";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PosterTile } from "@/components/PosterTile";

export default function ShowPage({ params }: PageProps<"/show/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-12 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Show params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Show({ params }: Pick<PageProps<"/show/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: show } = await supabase
    .from("shows")
    .select(
      `id, title, subtitle, type, authors, premiere_year,
       productions(id, slug, year, opening_date, title_override, color_ground, organization:organizations(name)),
       show_characters(id, name, sort_order,
                       credits(id, person:people(slug, display_name), production:productions(year)))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!show) notFound();

  const typeLabel = SHOW_TYPES.find((t) => t.value === show.type)?.label;
  const about = [show.subtitle, typeLabel, show.authors, show.premiere_year && `First produced ${show.premiere_year}`]
    .filter(Boolean)
    .join(" · ");
  const productions = [...(show.productions ?? [])].sort(
    (a, b) => b.year - a.year || (b.opening_date ?? "").localeCompare(a.opening_date ?? ""),
  );

  // Each character with the people who've played them, most recent first
  const characters = [...(show.show_characters ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((ch) => {
      const played = (ch.credits ?? [])
        .filter((c) => c.person)
        .sort((a, b) => (b.production?.year ?? 0) - (a.production?.year ?? 0));
      const people = new Map<string, string>();
      for (const c of played) people.set(c.person!.slug, c.person!.display_name);
      return { id: ch.id, name: ch.name, count: played.length, people: [...people.entries()] };
    })
    .filter((ch) => ch.count > 0);

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="display text-[42px] md:text-[72px]">{show.title}</h1>
        {about && <p className="m-0 text-[17px] text-muted">{about}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="heading">Productions</h2>
        {productions.length === 0 ? (
          <p className="m-0 text-muted">Productions of this show will appear here as they’re added.</p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
            {productions.map((p) => (
              <PosterTile
                key={p.id}
                href={`/production/${p.slug}`}
                title={p.title_override ?? show.title}
                ground={p.color_ground}
                caption={
                  <span className="text-[15px]">
                    {p.organization?.name} · <strong>{p.year}</strong>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex max-w-[880px] flex-col">
        <h2 className="heading border-b border-rule pb-2">Characters</h2>
        {characters.length === 0 ? (
          <p className="m-0 pt-3 text-muted">Characters will appear here once cast lists are added.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {characters.map((ch) => (
              <li key={ch.id} className="flex flex-col gap-0.5 border-b border-rule py-3 sm:flex-row sm:gap-6">
                <span className="font-bold sm:w-56 sm:flex-none">
                  {ch.name} <span className="font-normal text-muted">({ch.count})</span>
                </span>
                <span className="flex-1">
                  {ch.people.map(([slug, name], i) => (
                    <span key={slug}>
                      {i > 0 && ", "}
                      <Link href={`/person/${slug}`}>{name}</Link>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
