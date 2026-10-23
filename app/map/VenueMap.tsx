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
  nextPerformance: string | null; // within the next 90 days
};

type Point = { lat: number; lng: number; label: string };
type View = "all" | "shows" | "auditions";
const DAY_CHOICES = [30, 60, 90] as const;
type Days = (typeof DAY_CHOICES)[number];

// The three ways to look at the map. "Soon" is the next 30, 60 or 90
// days (the visitor picks).
const VIEWS: { value: View; label: string; match: (v: MapVenue, cutoff: string) => boolean; says: [string, string]; none: string }[] = [
  {
    value: "all",
    label: "All theaters",
    match: (v) => v.recent,
    says: ["theater where local companies have performed in the last two years", "theaters where local companies have performed in the last two years"],
    none: "No theaters on the map yet.",
  },
  {
    value: "shows",
    label: "Shows soon",
    match: (v, cutoff) => !!v.nextPerformance && v.nextPerformance < cutoff,
    says: ["theater has a performance in the next", "theaters have a performance in the next"],
    none: "No performances in the next",
  },
  {
    value: "auditions",
    label: "Auditions soon",
    match: (v, cutoff) => !!v.audition && v.audition.starts_at < cutoff,
    says: ["place is holding auditions in the next", "places are holding auditions in the next"],
    none: "No auditions in the next",
  },
];
const isView = (x: string | null): x is View => x === "all" || x === "shows" || x === "auditions";
const isDays = (x: number): x is Days => (DAY_CHOICES as readonly number[]).includes(x);

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

// The theater map: a choice of view, a pin per venue and a card for the
// chosen one. A ZIP code zooms in on the closest theaters (the site never
// asks for the visitor's location).
export function VenueMap({ venues, now }: { venues: MapVenue[]; now: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pins = useRef(new Map<string, HTMLButtonElement>());
  const here = useRef<Marker | null>(null);
  const zipId = useId();
  const params = useSearchParams();
  const [view, setView] = useState<View>(() => (isView(params.get("view")) ? (params.get("view") as View) : "all"));
  const daysId = useId();
  const [days, setDays] = useState<Days>(() => {
    const d = Number(params.get("days"));
    return isDays(d) ? d : 30;
  });
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [zip, setZip] = useState("");
  const [finding, setFinding] = useState(false);
  const [problem, setProblem] = useState("");

  const cutoff = useMemo(() => new Date(new Date(now).getTime() + days * 86400000).toISOString(), [now, days]);
  const current = VIEWS.find((v) => v.value === view)!;
  const shown = useMemo(() => venues.filter((v) => current.match(v, cutoff)), [venues, current, cutoff]);
  const chosen = shown.find((v) => v.id === selected) ?? null;

  // The address keeps the view and the days (so a link can share them)
  function remember(nextView: View, nextDays: Days) {
    const url = new URL(window.location.href);
    if (nextView === "all") url.searchParams.delete("view");
    else url.searchParams.set("view", nextView);
    if (nextDays === 30) url.searchParams.delete("days");
    else url.searchParams.set("days", String(nextDays));
    window.history.replaceState(null, "", url);
  }
  function pickView(next: View) {
    setView(next);
    remember(next, days);
  }
  function pickDays(next: Days) {
    setDays(next);
    remember(view, next);
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

  // A ZIP code: mark the spot
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

  // ZIP codes are looked up with OpenStreetMap's free search (only the
  // ZIP code is sent)
  async function findZip(e: React.FormEvent) {
    e.preventDefault();
    const q = zip.trim();
    setProblem("");
    if (!/^\d{5}$/.test(q)) return setProblem("Please enter a 5-digit ZIP code, like 02134.");
    setFinding(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&postalcode=${q}`);
      const [hit] = (await res.json()) as { lat: string; lon: string }[];
      if (hit) setOrigin({ lat: Number(hit.lat), lng: Number(hit.lon), label: q });
      else setProblem(`Couldn’t find ZIP code ${q}. Please check it and try again.`);
    } catch {
      setProblem("Couldn’t look that ZIP code up right now. Please try again.");
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
          const count = venues.filter((x) => v.match(x, cutoff)).length;
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
      {/* What's shown, in a sentence; the number of days is a choice */}
      <p className="-mt-1 m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[15px]" aria-live="polite">
        {view === "all" ? (
          shown.length ? (
            `${shown.length} ${current.says[shown.length === 1 ? 0 : 1]}.`
          ) : (
            current.none
          )
        ) : (
          <>
            <span>{shown.length ? `${shown.length} ${current.says[shown.length === 1 ? 0 : 1]}` : current.none}</span>
            <label htmlFor={daysId} className="sr-only">
              How many days ahead
            </label>
            <select
              id={daysId}
              value={days}
              onChange={(e) => pickDays(Number(e.target.value) as Days)}
              className="field h-10 cursor-pointer px-2 text-[15px] font-semibold"
            >
              {DAY_CHOICES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span>days.</span>
            {!shown.length && (
              <button type="button" onClick={() => pickView("all")} className="btn-text text-[15px]">
                See all theaters
              </button>
            )}
          </>
        )}
      </p>

      <form onSubmit={findZip} className="flex flex-wrap items-center gap-2" role="search" aria-label="Find theaters near a ZIP code">
        <label htmlFor={zipId} className="text-[15px] font-semibold">
          Theaters near ZIP code
        </label>
        <input
          id={zipId}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="02134"
          className="field h-11 w-[110px] px-3 tabular-nums"
        />
        <button type="submit" disabled={finding} className="btn-secondary min-h-11 px-4 text-[15px]">
          {finding ? "Finding…" : "Go"}
        </button>
      </form>
      {problem && (
        <p role="alert" className="callout m-0 text-[15px]">
          {problem}
        </p>
      )}

      <div className="relative h-[60vh] min-h-[380px] overflow-hidden rounded-lg border border-rule bg-soft md:h-[680px]">
        <div ref={box} className="h-full w-full" />
        {chosen && <VenueCard v={chosen} view={view} distance={origin ? miles(origin, chosen) : null} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

// Links in the card look like links: underlined, darker on hover
const cardLink = "underline decoration-[1.5px] underline-offset-[3px] hover:decoration-[2.5px]";

function VenueCard({ v, view, distance, onClose }: { v: MapVenue; view: View; distance: number | null; onClose: () => void }) {
  const show = v.next && (
    <p key="show" className="m-0">
      <span className="font-semibold">Next show: </span>
      <Link href={`/production/${v.next.slug}`} className={cardLink}>
        {v.next.title}
      </Link>
      <span className="text-muted"> · {runDates(v.next)}</span>
    </p>
  );
  const audition = v.audition && (
    <p key="audition" className="m-0">
      <span className="font-semibold">{v.audition.label || "Auditions"}: </span>
      <Link href={`/production/${v.audition.slug}`} className={cardLink}>
        {v.audition.title}
      </Link>
      <span className="text-muted"> · {auditionWhen(v.audition.starts_at)}</span>
    </p>
  );

  return (
    <div className="absolute inset-x-3 bottom-3 z-10 flex max-w-[420px] flex-col gap-2 rounded-lg border border-rule bg-page p-4 text-[15px] shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Link href={`/venue/${v.slug}`} className={`${cardLink} text-lg font-extrabold leading-tight`}>
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
              <Link href={`/company/${c.slug}`} className={`${cardLink} font-semibold`}>
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
        className="btn-secondary min-h-10 gap-1.5 self-start px-3.5 text-sm no-underline"
      >
        Get directions
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
        <span className="sr-only"> (opens Google Maps)</span>
      </a>
    </div>
  );
}
