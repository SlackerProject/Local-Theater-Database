import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ProductionsByYear } from "@/components/ProductionsByYear";

export default function VenuePage({ params }: PageProps<"/venue/[slug]">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-12 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Venue params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Venue({ params }: Pick<PageProps<"/venue/[slug]">, "params">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: venue } = await supabase
    .from("locations")
    .select(
      `id, name, street_address, town, state, postal_code, seating_capacity, description,
       productions(id, slug, year, title_override, color_ground,
                   show:shows(title), organization:organizations(id, slug, name)),
       organization_locations(organization:organizations(id, slug, name))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!venue) notFound();

  const address = [venue.street_address, venue.town, [venue.state, venue.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  // Google's map link opens the maps app on phones and the website elsewhere
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    venue.street_address ? address : `${venue.name}, ${address}`,
  )}`;

  // Companies that perform here: from productions plus linked companies
  const companies = new Map<string, { slug: string; name: string }>();
  for (const p of venue.productions ?? []) if (p.organization) companies.set(p.organization.id, p.organization);
  for (const ol of venue.organization_locations ?? []) if (ol.organization) companies.set(ol.organization.id, ol.organization);

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="display text-[42px] md:text-[72px]">{venue.name}</h1>
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-[17px] text-muted">
          <span>{address}</span>
          <span aria-hidden="true">·</span>
          <a href={mapUrl} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-11 items-center font-semibold text-ink">
            Map
          </a>
          {venue.seating_capacity && (
            <>
              <span aria-hidden="true">·</span>
              <span>{venue.seating_capacity.toLocaleString("en-US")} seats</span>
            </>
          )}
        </p>
        {venue.description && <p className="m-0 max-w-[620px]">{venue.description}</p>}
      </section>

      <div className="flex flex-wrap items-start gap-12">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          <ProductionsByYear
            empty="Productions staged here will appear as they’re added."
            productions={(venue.productions ?? [])
              .filter((p) => p.show)
              .map((p) => ({
                id: p.id,
                slug: p.slug,
                year: p.year,
                title: p.title_override ?? p.show!.title,
                ground: p.color_ground,
                caption: p.organization?.name ?? "",
              }))}
          />
        </div>
        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-2">
          <h2 className="subheading">Companies that perform here</h2>
          {companies.size === 0 ? (
            <p className="m-0 text-[15px] text-muted">Companies will appear here as productions are added.</p>
          ) : (
            [...companies.values()].map((c) => (
              <Link key={c.slug} href={`/company/${c.slug}`}>
                {c.name}
              </Link>
            ))
          )}
        </aside>
      </div>
    </>
  );
}
