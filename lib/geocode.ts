import type { createClient } from "@/lib/supabase/server";

// Map pins for venues, from the U.S. Census Bureau's free address lookup
// (no key; US street addresses only). The database server can't reach it,
// so the site's server looks venues up and saves them with set_venue_pin()
// (moderators only): while a moderator has the review queue open, and
// right after they approve something.

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Address = { street_address: string | null; town: string | null; state: string | null; postal_code: string | null };

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=";

// A pin, null for "no match", or undefined when the service didn't answer
// (try again next time)
export async function geocodeAddress(a: Address): Promise<{ lat: number; lng: number } | null | undefined> {
  const street = a.street_address?.trim();
  if (!street) return null;
  const state = a.state?.trim() || "MA";
  const tries = [
    [street, a.town?.trim(), [state, a.postal_code?.trim()].filter(Boolean).join(" ")],
    [street, a.town?.trim(), state], // a wrong ZIP code can spoil a match
  ].map((parts) => parts.filter(Boolean).join(", "));
  for (const address of [...new Set(tries)]) {
    try {
      const res = await fetch(CENSUS + encodeURIComponent(address), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return undefined;
      const json = (await res.json()) as { result?: { addressMatches?: { coordinates: { x: number; y: number } }[] } };
      const match = json.result?.addressMatches?.[0];
      if (match) return { lat: match.coordinates.y, lng: match.coordinates.x };
    } catch {
      return undefined;
    }
  }
  return null;
}

// Look up a few venues still missing a pin. Quietly does nothing for
// anyone who isn't a moderator (set_venue_pin refuses).
export async function fillVenuePins(supabase: Supabase, limit = 5) {
  const { data: venues } = await supabase
    .from("locations")
    .select("id, street_address, town, state, postal_code")
    .is("latitude", null)
    .eq("geocode_failed", false)
    .limit(limit);
  for (const v of venues ?? []) {
    const pin = await geocodeAddress(v);
    if (pin === undefined) return; // the service is down: try later
    // null means "no match" (the generated types don't know nulls are allowed)
    await supabase.rpc("set_venue_pin", { p_id: v.id, p_latitude: (pin?.lat ?? null) as number, p_longitude: (pin?.lng ?? null) as number });
  }
}
