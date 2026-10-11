import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SHOW_TYPES } from "@/lib/submission";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PosterTile } from "@/components/PosterTile";
import { ModeratorDeleteSection } from "@/components/ModeratorDeleteSection";
import { EditButton, SuggestEdit } from "@/components/SuggestEdit";
import { getCurrentUser } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";

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
       productions(id, slug, year, opening_date, title_override, color_ground,
                   poster:media!productions_poster_fk(thumb_key), organization:organizations(name))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!show) notFound();
  const user = await getCurrentUser();

  const typeLabel = SHOW_TYPES.find((t) => t.value === show.type)?.label;
  const about = [show.subtitle, typeLabel, show.authors, show.premiere_year && `First produced ${show.premiere_year}`]
    .filter(Boolean)
    .join(" · ");
  const productions = [...(show.productions ?? [])].sort(
    (a, b) => b.year - a.year || (b.opening_date ?? "").localeCompare(a.opening_date ?? ""),
  );

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="display text-[42px] md:text-[72px]">{show.title}</h1>
          <EditButton kind="show" slug={slug} signedIn={!!user} />
        </div>
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
                posterUrl={mediaUrl(p.poster?.thumb_key)}
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
      <SuggestEdit kind="show" slug={slug} signedIn={!!user} />
      <ModeratorDeleteSection table="shows" id={show.id} name={show.title} afterDelete="/shows" />
    </>
  );
}
