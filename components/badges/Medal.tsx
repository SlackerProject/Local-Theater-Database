import type { Collectible, Metal } from "@/lib/badges";

// Contributor medals, copied exactly from design-reference-v2/badges.html.
// Each metal is a different shape, so they work without color. `dots` (1-3)
// shows the level; `muted` draws the grayed-out ladder version.

const STAR = "M24 15.5l2.6 5.6 6.1.6-4.6 4.1 1.4 6-5.5-3.2-5.5 3.2 1.4-6-4.6-4.1 6.1-.6z";
const GOLD_POINTS =
  "24.00,3.00 28.14,6.55 33.50,5.55 35.31,10.69 40.45,12.50 39.45,17.86 43.00,22.00 39.45,26.14 40.45,31.50 35.31,33.31 33.50,38.45 28.14,37.45 24.00,41.00 19.86,37.45 14.50,38.45 12.69,33.31 7.55,31.50 8.55,26.14 5.00,22.00 8.55,17.86 7.55,12.50 12.69,10.69 14.50,5.55 19.86,6.55";
const PLATINUM_POINTS =
  "24.00,1.50 27.22,4.82 31.46,2.98 33.17,7.28 37.79,7.21 37.72,11.83 42.02,13.54 40.18,17.78 43.50,21.00 40.18,24.22 42.02,28.46 37.72,30.17 37.79,34.79 33.17,34.72 31.46,39.02 27.22,37.18 24.00,40.50 20.78,37.18 16.54,39.02 14.83,34.72 10.21,34.79 10.28,30.17 5.98,28.46 7.82,24.22 4.50,21.00 7.82,17.78 5.98,13.54 10.28,11.83 10.21,7.21 14.83,7.28 16.54,2.98 20.78,4.82";
const RAYS: [number, number, number, number][] = [
  [42.0, 23.0, 47.0, 23.0],
  [39.59, 32.0, 43.92, 34.5],
  [33.0, 38.59, 35.5, 42.92],
  [24.0, 41.0, 24.0, 46.0],
  [15.0, 38.59, 12.5, 42.92],
  [8.41, 32.0, 4.08, 34.5],
  [6.0, 23.0, 1.0, 23.0],
  [8.41, 14.0, 4.08, 11.5],
  [15.0, 7.41, 12.5, 3.08],
  [24.0, 5.0, 24.0, 0.0],
  [33.0, 7.41, 35.5, 3.08],
  [39.59, 14.0, 43.92, 11.5],
];
const DOT_X: Record<number, number[]> = { 1: [24], 2: [19, 29], 3: [14, 24, 34] };
const GRAY = "#D4D4D4";

export function Medal({ metal, dots = 0, size = 64, muted = false }: { metal: Metal; dots?: number; size?: number; muted?: boolean }) {
  const c = (color: string) => (muted ? GRAY : color);
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 50" style={{ flex: "0 0 auto", overflow: "visible" }}>
      {metal === "bronze" && (
        <>
          <circle cx="24" cy="22" r="15" fill={c("#B0703F")} stroke={c("#6E4223")} strokeWidth="1.5" />
          <path d={STAR} transform="translate(0,-2)" fill={c("#F6E3D2")} />
        </>
      )}
      {metal === "silver" && (
        <>
          <circle cx="24" cy="22" r="16" fill={c("#A9B2BC")} stroke={c("#56616C")} strokeWidth="1.5" />
          <circle cx="24" cy="22" r="11.5" fill="none" stroke={c("#FFFFFF")} strokeWidth="1.6" />
          <path d={STAR} transform="translate(0,-2)" fill={c("#FFFFFF")} />
        </>
      )}
      {metal === "gold" && (
        <>
          <polygon points={GOLD_POINTS} fill={c("#D4A72C")} stroke={c("#7A5A0E")} strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="24" cy="22" r="11.5" fill={c("#B98A16")} />
          <path d={STAR} transform="translate(0,-2)" fill={c("#FFF6D6")} />
        </>
      )}
      {metal === "platinum" && (
        <>
          <path d="M16 31l-4 13 6-3 3 5 4-12z" fill={c("#5B6B78")} />
          <path d="M32 31l4 13-6-3-3 5-4-12z" fill={c("#5B6B78")} />
          <polygon points={PLATINUM_POINTS} fill={c("#E3E8EC")} stroke={c("#4A5864")} strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="24" cy="21" r="12.5" fill="none" stroke={c("#4A5864")} strokeWidth="1.2" />
          <circle cx="24" cy="21" r="10" fill={c("#4A5864")} />
          <path d={STAR} transform="translate(0,-3) scale(1)" fill={c("#FFFFFF")} />
        </>
      )}
      {metal === "diamond" && (
        <>
          {RAYS.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c("#1E2A4A")} strokeWidth="2" strokeLinecap="round" />
          ))}
          <polygon points="15,14 33,14 40,22 24,40 8,22" fill={c("#1E2A4A")} stroke={c("#0E1630")} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M8 22h32M15 14l4 8 5-8 5 8 4-8M19 22l5 18 5-18" fill="none" stroke={c("#9FB4F0")} strokeWidth="1.2" strokeLinejoin="round" />
        </>
      )}
      {(DOT_X[dots] ?? []).map((x) => (
        <circle key={x} cx={x} cy="46" r="2" fill={c("#141414")} />
      ))}
    </svg>
  );
}

// Collectible badges (from contributor-profile.html): black line art on a
// soft tile; unearned ones are grayed out
export function CollectibleIcon({ badge, earned }: { badge: Collectible; earned: boolean }) {
  const ink = earned ? "#141414" : "#C4C4C4";
  const line = { fill: "none", stroke: ink, strokeWidth: 2.2 } as const;
  return (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 48 48">
      {badge.icon === "shield" && (
        <>
          <path d="M24 9l12 4.5v8.5c0 8-5.4 13.6-12 16-6.6-2.4-12-8-12-16v-8.5z" {...line} strokeLinejoin="round" />
          <path d="M18.5 23.5l4 4 7.5-8" {...line} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {badge.icon === "mask" && (
        <>
          <path d="M13 12h22v10c0 8-5 13-11 13s-11-5-11-13z" {...line} strokeLinejoin="round" />
          <path d="M17.5 19.5q2.5-2.5 5 0M25.5 19.5q2.5-2.5 5 0M18.5 26q5.5 5 11 0" {...line} strokeLinecap="round" />
        </>
      )}
      {badge.icon === "flag" && <path d="M16 39V10M16 11h17l-4 6 4 6H16" {...line} strokeLinecap="round" strokeLinejoin="round" />}
      {badge.icon === "ticket" && (
        <>
          <path d="M8 15h32v6a3 3 0 0 0 0 6v6H8v-6a3 3 0 0 0 0-6z" {...line} strokeLinejoin="round" />
          <text
            x="24"
            y="28.5"
            textAnchor="middle"
            fontFamily="Schibsted Grotesk, Arial, sans-serif"
            fontWeight="800"
            fontSize={(badge.number ?? 0) >= 100 ? 9.5 : 11}
            fill={ink}
          >
            {badge.number}
          </text>
        </>
      )}
      {badge.icon === "camera" && (
        <>
          <rect x="10" y="15" width="28" height="20" rx="3" {...line} />
          <path d="M19 15l2-4h6l2 4" {...line} strokeLinejoin="round" />
          <circle cx="24" cy="25" r="5.5" {...line} />
        </>
      )}
    </svg>
  );
}
