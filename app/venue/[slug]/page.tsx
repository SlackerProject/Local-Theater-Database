import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/brand";
import Link from "next/link";
import { forwardIfMerged } from "@/lib/merged";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ProductionsByYear } from "@/components/ProductionsByYear";
import { ModeratorDeleteSection } from "@/components/ModeratorDeleteSection";
import { EditButton, SuggestEdit } from "@/components/SuggestEdit";
import { getCurrentUser } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { SeatingChartUploader } from "@/components/uploads/UploadPanels";

// Browser tab and shared links: "Venue · Town · Local Theater Database"
export async function generateMetadata({ params }: PageProps<"/venue/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: v } = await supabase.from("locations").select("name, town").eq("slug", slug).maybeSingle();
  if (!v) return { title: "Venue" };
  const title = [v.name, v.town].filter(Boolean).join(" · ");
  const description = `Productions at ${v.name}${v.town ? ` in ${v.town}` : ""}.`;
  return { title, description, openGraph: { type: "website", siteName: SITE_NAME, url: `/venue/${slug}`, title, description }, twitter: { card: "summary", title, description } };
}

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
      `id, name, stage_name, street_address, town, state, postal_code, seating_capacity, seating_style, accessibility, description,
       chart:media!locations_seating_chart_fk(storage_key, thumb_key, photographer_credit),
       productions(id, slug, year, title_override, color_ground, poster:media!productions_poster_fk(thumb_key),
                   show:shows(title), organization:organizations(id, slug, name)),
       organization_locations(organization:organizations(id, slug, name))`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!venue) return forwardIfMerged("locations", slug);
  const user = await getCurrentUser();

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="display text-[42px] md:text-[72px]">{venue.name}</h1>
          <EditButton kind="venue" slug={slug} signedIn={!!user} />
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-[17px] text-muted">
          {venue.stage_name && (
            <>
              <span className="font-semibold text-ink">{venue.stage_name}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{address}</span>
          <span aria-hidden="true">·</span>
          <a href={mapUrl} rel="noopener noreferrer" target="_blank" className="inline-flex min-h-11 items-center font-semibold text-ink">
            Map
          </a>
        </p>
        {venue.description && <p className="m-0 max-w-[620px]">{venue.description}</p>}
      </section>

      {/* Seating: seats, style, access, and the chart */}
      {(venue.seating_capacity || venue.seating_style || venue.accessibility || venue.chart || user) && (
        <section className="flex flex-col gap-3">
          <h2 className="heading">Seating</h2>
          {(venue.seating_capacity || venue.seating_style || venue.accessibility) && (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                venue.seating_capacity && { label: "Seats", value: venue.seating_capacity.toLocaleString("en-US") },
                venue.seating_style && { label: "Style", value: venue.seating_style },
                venue.accessibility && { label: "Access", value: venue.accessibility },
              ]
                .filter((x): x is { label: string; value: string } => !!x)
                .map((x) => (
                  <div key={x.label} className="flex flex-col gap-1 rounded-lg bg-soft p-4">
                    <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-muted">{x.label}</span>
                    <span className="text-[16px]">{x.value}</span>
                  </div>
                ))}
            </div>
          )}
          {venue.chart && (
            <figure id="seating-chart" className="m-0 flex max-w-[720px] scroll-mt-24 flex-col gap-1.5">
              <a href={mediaUrl(venue.chart.storage_key)!} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-rule bg-white">
                <img src={mediaUrl(venue.chart.thumb_key ?? venue.chart.storage_key)!} alt={`Seating chart for ${venue.name}`} className="h-auto w-full" />
              </a>
              {venue.chart.photographer_credit && <figcaption className="text-xs text-muted">Chart: {venue.chart.photographer_credit}</figcaption>}
            </figure>
          )}
          {user ? (
            <SeatingChartUploader locationId={venue.id} hasChart={!!venue.chart} />
          ) : (
            !venue.chart && (
              <Link href={`/signin?next=${encodeURIComponent(`/venue/${slug}`)}`} className="self-start text-[15px] font-semibold">
                Sign in to add a seating chart
              </Link>
            )
          )}
        </section>
      )}

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
                posterUrl: mediaUrl(p.poster?.thumb_key),
                caption: p.organization?.name ?? "",
              }))}
          />
        </div>
        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-2">
          <h2 className="subheading">Companies That Perform Here</h2>
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
      <SuggestEdit kind="venue" slug={slug} signedIn={!!user} />
      <ModeratorDeleteSection table="locations" id={venue.id} name={venue.name} afterDelete="/" />
    </>
  );
}
