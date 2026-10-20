"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  audition: { title: string; year: number; slug: string; starts_at: string; label: string | null; company: string } | null;
  recent: boolean;
  showsSoon: boolean;
  auditionsSoon: boolean;
};

type Point = { lat: number; lng: number; label: string };
type View = "all" | "shows" | "auditions";

// The three ways to look at the map. "Soon" means the next 30 days.
const VIEWS: { value: View; label: string; match: (v: MapVenue) => boolean; says: (n: number) => string; empty: string }[] = [
  {
    value: "all",
    label: "All theaters",
    match: (v) => v.recent,
    says: (n) => `${n} ${n === 1 ? "theater" : "theaters"} where local companies have performed in the last two years.`,
    empty: "No theaters on the map yet.",
  },
  {
    value: "shows",
    label: "Shows soon",
    match: (v) => v.showsSoon,
    says: (n) => `${n} ${n === 1 ? "theater has" : "theaters have"} a performance in the next 30 days.`,
    empty: "No performances on the map in the next 30 days.",
  },
  {
    value: "auditions",
    label: "Auditions soon",
    match: (v) => v.auditionsSoon,
    says: (n) => `${n} ${n === 1 ? "place is" : "places are"} holding auditions in the next 30 days.`,
    empty: "No auditions in the next 30 days yet. Check back soon.",
  },
];
const isView = (x: string | null): x is View => x === "all" || x === "shows" || x === "auditions";

// Free map pictures from OpenFreeMap (no account, no tracking)
const STYLE = "https://tiles.openfreemap.org/styles/positron";
const PIN = `<svg aria-hidden="true" viewBox="0 0 24 32" width="26" height="34"><path d="M12 1C5.9 1 1 5.9 1 12c0 8.3 11 19 11 19s11-10.7 11-19C23 5.9 18.1 1 12 1z" fill="currentColor" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12" r="4.2" fill="#fff"/></svg>`;

// Straight-line miles between two points
function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
const distanceText = (d: number) => `${d < 10 ? d.toFixed(1) : Math.round(d)} mi`;

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
function runDates(n: NonNullable<MapVenue["next"]>) {
  if (n.opening && n.closing && n.opening !== n.closing) return `${shortDate(n.opening)} – ${shortDate(n.closing)}`;
  return n.opening ? shortDate(n.opening) : String(n.year);
}
const auditionWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// The theater map: a choice of view, a pin per venue, a card for the
// chosen one, and a list beside it (nearest first once the visitor shares
// a location or a town)
export function VenueMap({ venues }: { venues: MapVenue[] }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pins = useRef(new Map<string, HTMLButtonElement>());
  const here = useRef<Marker | null>(null);
  const townId = useId();
  const params = useSearchParams();
  const [view, setView] = useState<View>(() => (isView(params.get("view")) ? (params.get("view") as View) : "all"));
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [town, setTown] = useState("");
  const [finding, setFinding] = useState(false);
  const [problem, setProblem] = useState("");

  const current = VIEWS.find((v) => v.value === view)!;
  const shown = useMemo(() => venues.filter(current.match), [venues, current]);
  const list = useMemo(() => {
    const rows = shown.map((v) => ({ v, distance: origin ? miles(origin, v) : null }));
    return origin ? rows.sort((a, b) => a.distance! - b.distance!) : rows;
  }, [shown, origin]);
  const chosen = shown.find((v) => v.id === selected) ?? null;

  // Switching views: the address keeps the view (so a link can share it)
  function pickView(next: View) {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }

  // The map itself, loaded only on this page
  useEffect(() => {
    let cancelled = false;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !box.current) return;
      const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [-71.2, 42.3], zoom: 8.3, attributionControl: { compact: true } });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      for (const v of venues) {
        const holder = document.createElement("div");
        const pin = document.createElement("button");
        pin.type = "button";
        pin.setAttribute("aria-label", v.name);
        pin.className = "block cursor-pointer border-0 bg-transparent p-0 text-ink transition-transform data-[selected=true]:scale-125 data-[selected=true]:text-alert";
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

  // Only the view's pins show; the chosen one is red and on top
  useEffect(() => {
    if (!ready) return;
    const visible = new Set(shown.map((v) => v.id));
    for (const v of venues) {
      const pin = pins.current.get(v.id);
      if (!pin) continue;
      pin.parentElement!.style.display = visible.has(v.id) ? "" : "none";
      pin.dataset.selected = String(v.id === selected);
      pin.parentElement!.style.zIndex = v.id === selected ? "2" : "0";
    }
  }, [ready, venues, shown, selected]);

  // A new view: frame its pins (around the visitor's spot, if they gave one)
  useEffect(() => {
    if (!ready || !map.current) return;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      const m = map.current;
      if (!m) return;
      const rows = origin ? shown.map((v) => ({ v, d: miles(origin, v) })).sort((a, b) => a.d - b.d).slice(0, 5).map((r) => r.v) : shown;
      if (!rows.length && !origin) return;
      const bounds = new maplibregl.LngLatBounds();
      if (origin) bounds.extend([origin.lng, origin.lat]);
      for (const v of rows) bounds.extend([v.lng, v.lat]);
      m.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 400 });
    });
  }, [ready, shown, origin]);

  // "Near me" or a town: mark the spot
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
    });
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

  return (
    <div className="flex flex-col gap-4">
      {/* The three views, as one big switch */}
      <div role="radiogroup" aria-label="Show on the map" className="grid grid-cols-3 gap-1 rounded-xl bg-soft p-1 sm:max-w-[560px]">
        {VIEWS.map((v) => {
          const on = v.value === view;
          const count = venues.filter(v.match).length;
          return (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pickView(v.value)}
              className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border-0 px-2 py-1.5 text-center leading-tight ${
                on ? "bg-ink text-white shadow-sm" : "bg-transparent text-ink hover:bg-page"
              }`}
            >
              <span className="text-[15px] font-bold">{v.label}</span>
              <span className={`text-[13px] ${on ? "text-white/80" : "text-muted"}`}>{count}</span>
            </button>
          );
        })}
      </div>
      <p className="-mt-1 m-0 text-[15px]" aria-live="polite">
        {shown.length ? current.says(shown.length) : current.empty}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <button type="button" onClick={nearMe} disabled={finding} className="btn-secondary min-h-11 gap-2 px-4 text-[15px]">
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
      </div>
      {problem && (
        <p role="alert" className="callout m-0 text-[15px]">
          {problem}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative h-[55vh] min-h-[360px] overflow-hidden rounded-lg border border-rule bg-soft md:h-[640px]">
          <div ref={box} className="h-full w-full" />
          {chosen && (
            <VenueCard v={chosen} view={view} distance={origin ? miles(origin, chosen) : null} onClose={() => setSelected(null)} />
          )}
        </div>

        <section aria-label="Theaters" className="flex min-w-0 flex-col gap-2 md:h-[640px]">
          <p className="m-0 text-sm text-muted">{origin ? `Nearest to ${origin.label} first` : "A to Z"}</p>
          {list.length ? (
            <ol className="m-0 flex list-none flex-col overflow-y-auto border-t border-rule p-0 md:flex-1">
              {list.map(({ v, distance }) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => choose(v)}
                    aria-pressed={v.id === selected}
                    className={`flex w-full cursor-pointer gap-3 border-0 border-b border-rule px-2 py-2.5 text-left ${v.id === selected ? "bg-soft" : "bg-transparent hover:bg-soft"}`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold leading-snug">{v.name}</span>
                      <span className="truncate text-sm text-muted">{listLine(v, view)}</span>
                    </span>
                    {distance !== null && <span className="flex-none text-sm tabular-nums text-muted">{distanceText(distance)}</span>}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex flex-col items-start gap-3 border-t border-rule pt-4">
              <p className="m-0 text-muted">{current.empty}</p>
              <button type="button" onClick={() => pickView("all")} className="btn-secondary min-h-11 px-4 text-[15px]">
                See all theaters
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// The list's second line says what the view is about
function listLine(v: MapVenue, view: View) {
  if (view === "auditions" && v.audition) return `${v.audition.title} · ${auditionWhen(v.audition.starts_at)}`;
  if (view === "shows" && v.next) return `${v.next.title} · ${runDates(v.next)}`;
  return v.companies.map((c) => c.name).join(", ");
}

function VenueCard({ v, view, distance, onClose }: { v: MapVenue; view: View; distance: number | null; onClose: () => void }) {
  const show = v.next && (
    <p key="show" className="m-0">
      <span className="font-semibold">Next show: </span>
      <Link href={`/production/${v.next.slug}`}>{v.next.title}</Link>
      <span className="text-muted"> · {runDates(v.next)}</span>
    </p>
  );
  const audition = v.audition && (
    <p key="audition" className="m-0">
      <span className="font-semibold">{v.audition.label || "Auditions"}: </span>
      <Link href={`/production/${v.audition.slug}`}>{v.audition.title}</Link>
      <span className="text-muted"> · {auditionWhen(v.audition.starts_at)}</span>
    </p>
  );

  return (
    <div className="absolute inset-x-3 bottom-3 z-10 flex max-w-[420px] flex-col gap-2 rounded-lg border border-rule bg-page p-4 text-[15px] shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Link href={`/venue/${v.slug}`} className="text-lg font-extrabold leading-tight">
            {v.name}
          </Link>
          <span className="text-sm text-muted">
            {v.address}
            {distance !== null && ` · ${distanceText(distance)} away`}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-10 w-10 flex-none cursor-pointer items-center justify-center border-0 bg-transparent">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {/* What the view is about comes first */}
      {view === "auditions" ? [audition, show] : [show, audition]}
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
