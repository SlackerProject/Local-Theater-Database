"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

export type MapVenue = {
  id: string;
  slug: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  companies: { name: string; slug: string }[];
  next: { title: string; year: number; slug: string; opening: string | null; closing: string | null; company: string } | null;
  playingSoon: boolean;
};

type Point = { lat: number; lng: number; label: string };

// Free map pictures from OpenFreeMap (no account, no tracking)
const STYLE = "https://tiles.openfreemap.org/styles/positron";
const PIN = `<svg aria-hidden="true" viewBox="0 0 24 32" width="26" height="34"><path d="M12 1C5.9 1 1 5.9 1 12c0 8.3 11 19 11 19s11-10.7 11-19C23 5.9 18.1 1 12 1z" fill="currentColor" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12" r="4.2" fill="#fff"/></svg>`;

// Straight-line miles between two points
function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
function runDates(n: NonNullable<MapVenue["next"]>) {
  if (n.opening && n.closing && n.opening !== n.closing) return `${shortDate(n.opening)} – ${shortDate(n.closing)}`;
  return n.opening ? shortDate(n.opening) : String(n.year);
}

// The theater map: a pin per venue, a card for the chosen one, and a list
// beside it (nearest first once the visitor shares a location or a town)
export function VenueMap({ venues }: { venues: MapVenue[] }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pins = useRef(new Map<string, HTMLButtonElement>());
  const here = useRef<Marker | null>(null);
  const townId = useId();
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [soonOnly, setSoonOnly] = useState(false);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [town, setTown] = useState("");
  const [finding, setFinding] = useState(false);
  const [problem, setProblem] = useState("");

  const shown = useMemo(() => venues.filter((v) => !soonOnly || v.playingSoon), [venues, soonOnly]);
  const list = useMemo(() => {
    const rows = shown.map((v) => ({ v, distance: origin ? miles(origin, v) : null }));
    return origin ? rows.sort((a, b) => a.distance! - b.distance!) : rows;
  }, [shown, origin]);
  const chosen = venues.find((v) => v.id === selected) ?? null;

  // The map itself, loaded only on this page
  useEffect(() => {
    let cancelled = false;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !box.current) return;
      const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [-71.2, 42.3], zoom: 8.3, attributionControl: { compact: true } });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      if (venues.length) {
        const bounds = new maplibregl.LngLatBounds();
        for (const v of venues) bounds.extend([v.lng, v.lat]);
        m.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 });
      }
      for (const v of venues) {
        const holder = document.createElement("div");
        const pin = document.createElement("button");
        pin.type = "button";
        pin.setAttribute("aria-label", v.name);
        pin.className =
          "block cursor-pointer border-0 bg-transparent p-0 text-[#8C8C8C] transition-transform data-[soon=true]:text-ink data-[selected=true]:scale-125 data-[selected=true]:text-alert";
        pin.innerHTML = PIN;
        pin.addEventListener("click", (e) => {
          e.stopPropagation();
          setSelected(v.id);
        });
        holder.appendChild(pin);
        new maplibregl.Marker({ element: holder, anchor: "bottom" }).setLngLat([v.lng, v.lat]).addTo(m);
        pins.current.set(v.id, pin);
      }
      m.on("click", () => setSelected(null));
      map.current = m;
      setReady(true);
    });
    const currentPins = pins.current;
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      currentPins.clear();
    };
  }, [venues]);

  // Pins follow the filter and the choice
  useEffect(() => {
    if (!ready) return;
    const visible = new Set(shown.map((v) => v.id));
    for (const v of venues) {
      const pin = pins.current.get(v.id);
      if (!pin) continue;
      pin.parentElement!.style.display = visible.has(v.id) ? "" : "none";
      pin.dataset.soon = String(v.playingSoon);
      pin.dataset.selected = String(v.id === selected);
      pin.parentElement!.style.zIndex = v.id === selected ? "2" : v.playingSoon ? "1" : "0";
    }
  }, [ready, venues, shown, selected]);

  // "Near me" or a town: mark the spot and show it with the closest venues
  useEffect(() => {
    if (!ready || !origin || !map.current) return;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      const m = map.current;
      if (!m) return;
      here.current?.remove();
      const dot = document.createElement("div");
      dot.className = "h-4 w-4 rounded-full border-[3px] border-white bg-[#2563EB] shadow-[0_0_0_2px_rgba(37,99,235,0.35)]";
      dot.setAttribute("aria-hidden", "true");
      here.current = new maplibregl.Marker({ element: dot }).setLngLat([origin.lng, origin.lat]).addTo(m);
      const bounds = new maplibregl.LngLatBounds([origin.lng, origin.lat], [origin.lng, origin.lat]);
      for (const { v } of list.slice(0, 5)) bounds.extend([v.lng, v.lat]);
      m.fitBounds(bounds, { padding: 60, maxZoom: 12 });
    });
    // Only when the starting point changes, not on every list re-sort
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, origin]);

  function choose(v: MapVenue) {
    setSelected(v.id);
    map.current?.easeTo({ center: [v.lng, v.lat], zoom: Math.max(map.current.getZoom(), 11) });
    box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function nearMe() {
    setProblem("");
    if (!navigator.geolocation) return setProblem("Your browser can’t share a location. Type a town instead.");
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setFinding(false);
        setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude, label: "you" });
      },
      () => {
        setFinding(false);
        setProblem("Couldn’t get your location. Type a town instead.");
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  // Towns are looked up with OpenStreetMap's free search (only the town
  // name is sent)
  async function findTown(e: React.FormEvent) {
    e.preventDefault();
    const q = town.trim();
    if (!q) return;
    setProblem("");
    setFinding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(`${q}, Massachusetts`)}`,
      );
      const [hit] = (await res.json()) as { lat: string; lon: string }[];
      if (hit) setOrigin({ lat: Number(hit.lat), lng: Number(hit.lon), label: q });
      else setProblem(`Couldn’t find “${q}”. Check the spelling, or try a nearby town.`);
    } catch {
      setProblem("Couldn’t look that town up right now. Please try again.");
    } finally {
      setFinding(false);
    }
  }

  const soonCount = venues.filter((v) => v.playingSoon).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" onClick={nearMe} disabled={finding} className="btn-primary min-h-11 gap-2 px-4 text-[15px]">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          Near me
        </button>
        <form onSubmit={findTown} className="flex items-center gap-2" role="search" aria-label="Find theaters near a town">
          <label htmlFor={townId} className="text-[15px] font-semibold">
            or near
          </label>
          <input
            id={townId}
            value={town}
            onChange={(e) => setTown(e.target.value)}
            placeholder="Town"
            autoComplete="address-level2"
            className="field h-11 w-[150px] px-3"
          />
          <button type="submit" disabled={finding} className="btn-secondary min-h-11 px-4 text-[15px]">
            Go
          </button>
        </form>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
          <input type="checkbox" checked={soonOnly} onChange={(e) => setSoonOnly(e.target.checked)} className="h-5 w-5 accent-ink" />
          Only playing in the next 60 days ({soonCount})
        </label>
      </div>
      {problem && (
        <p role="alert" className="callout m-0 text-[15px]">
          {problem}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative h-[55vh] min-h-[360px] overflow-hidden rounded-lg border border-rule bg-soft md:h-[640px]">
          <div ref={box} className="h-full w-full" />
          {chosen && <VenueCard v={chosen} distance={origin ? miles(origin, chosen) : null} onClose={() => setSelected(null)} />}
        </div>

        <section aria-label="Venues" className="flex min-w-0 flex-col gap-2 md:h-[640px]">
          <p className="m-0 text-sm text-muted">
            {list.length} {list.length === 1 ? "venue" : "venues"}
            {origin ? `, nearest to ${origin.label} first` : ", A to Z"}
            {" · "}
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-ink" /> playing soon
            </span>
          </p>
          <ol className="m-0 flex list-none flex-col overflow-y-auto border-t border-rule p-0 md:flex-1">
            {list.map(({ v, distance }) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => choose(v)}
                  aria-pressed={v.id === selected}
                  className={`flex w-full cursor-pointer gap-3 border-0 border-b border-rule px-1 py-2.5 text-left ${v.id === selected ? "bg-soft" : "bg-transparent hover:bg-soft"}`}
                >
                  <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${v.playingSoon ? "bg-ink" : "bg-[#C4C4C4]"}`} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold leading-snug">{v.name}</span>
                    <span className="truncate text-sm text-muted">{v.companies.map((c) => c.name).join(", ")}</span>
                  </span>
                  {distance !== null && <span className="flex-none text-sm tabular-nums text-muted">{distance < 10 ? distance.toFixed(1) : Math.round(distance)} mi</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function VenueCard({ v, distance, onClose }: { v: MapVenue; distance: number | null; onClose: () => void }) {
  return (
    <div className="absolute inset-x-3 bottom-3 z-10 flex max-w-[420px] flex-col gap-2 rounded-lg border border-rule bg-page p-4 text-[15px] shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Link href={`/venue/${v.slug}`} className="text-lg font-extrabold leading-tight">
            {v.name}
          </Link>
          <span className="text-sm text-muted">
            {v.address}
            {distance !== null && ` · ${distance < 10 ? distance.toFixed(1) : Math.round(distance)} mi away`}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-10 w-10 flex-none cursor-pointer items-center justify-center border-0 bg-transparent">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {v.companies.length > 0 && (
        <p className="m-0">
          <span className="font-semibold">Performs here: </span>
          {v.companies.map((c, i) => (
            <span key={c.slug}>
              {i > 0 && ", "}
              <Link href={`/company/${c.slug}`} className="font-semibold">
                {c.name}
              </Link>
            </span>
          ))}
        </p>
      )}
      {v.next && (
        <p className="m-0">
          <span className="font-semibold">{v.playingSoon ? "On now or soon: " : "Next: "}</span>
          <Link href={`/production/${v.next.slug}`}>{v.next.title}</Link>
          <span className="text-muted"> · {runDates(v.next)}</span>
        </p>
      )}
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start text-sm font-semibold"
      >
        Directions
      </a>
    </div>
  );
}
