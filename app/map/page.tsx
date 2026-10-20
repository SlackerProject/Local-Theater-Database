import type { Metadata } from "next";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { SERVICE_AREA } from "@/lib/brand";
import { VenueMap, type MapVenue } from "./VenueMap";

export const metadata: Metadata = {
  title: "Theater map",
  description: `Community theaters near you in ${SERVICE_AREA}: where local companies perform and what’s on next.`,
};

export default function MapPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-5 px-4 pb-16 pt-8 md:px-8 md:pt-10">
        <div className="flex flex-col gap-1.5">
          <h1 className="display text-[40px] md:text-[56px]">Theater map</h1>
          <p className="m-0 max-w-[720px] text-muted">
            Where local companies have performed in the last two years. Choose a pin to see who performs there and what’s on next.
          </p>
        </div>
        <Suspense fallback={<div className="h-[60vh] rounded-lg bg-soft" aria-label="Loading the map" />}>
          <Venues />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Venues() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("map_venues");
  if (error) return <p className="callout m-0">Couldn’t load the map: {error.message}</p>;
  const venues: MapVenue[] = (data ?? []).map((v) => ({
    id: v.id,
    slug: v.slug,
    name: v.name,
    address: v.address,
    lat: Number(v.latitude),
    lng: Number(v.longitude),
    companies: (v.companies as MapVenue["companies"] | null) ?? [],
    next: (v.next_show as MapVenue["next"]) ?? null,
    playingSoon: v.playing_soon,
  }));
  return <VenueMap venues={venues} />;
}
