// A simple made-up poster for a production without one: the title set in
// large type on a rich color, with the year and company at the foot. The
// color comes from the title, so a show looks the same everywhere. It fills
// its frame and its type scales with it (container units).

const PALETTES = [
  { bg: "#1F3A5F", ink: "#F4EBDD", accent: "#E8B04B" },
  { bg: "#5B1A2B", ink: "#F7E7D3", accent: "#E9A23B" },
  { bg: "#1E4D3B", ink: "#F1EAD8", accent: "#D9B65C" },
  { bg: "#2E2A4F", ink: "#EFE6F5", accent: "#F2A65A" },
  { bg: "#7A3B12", ink: "#FBEBD6", accent: "#F6D28A" },
  { bg: "#14424C", ink: "#E8F1EE", accent: "#F28F6B" },
  { bg: "#3A3A3A", ink: "#F2EFE9", accent: "#E5C07B" },
  { bg: "#6B2E5E", ink: "#F8E8F1", accent: "#F3C969" },
];

function paletteFor(title: string) {
  let h = 0;
  for (const ch of title.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

export function SimplePoster({ title, year, company }: { title: string; year?: number | string | null; company?: string | null }) {
  const c = paletteFor(title);
  const size = title.length <= 8 ? 17 : title.length <= 16 ? 13.5 : title.length <= 30 ? 10.5 : 8.5;
  const foot = [year, company].filter(Boolean).join(" · ");
  return (
    <span
      aria-hidden="true"
      className="@container relative flex h-full w-full flex-col items-center justify-between overflow-hidden text-center"
      style={{ background: c.bg, color: c.ink }}
    >
      {/* A thin frame, inset like a printed border */}
      <span className="pointer-events-none absolute inset-[4%] rounded-[2px] border" style={{ borderColor: c.accent, opacity: 0.55 }} />
      <span className="pt-[11%] font-bold" style={{ color: c.accent, fontSize: "7cqw", letterSpacing: "0.3em" }}>
        ★ ★ ★
      </span>
      <span
        className="line-clamp-5 px-[10%] font-extrabold uppercase leading-[1.02] [overflow-wrap:anywhere]"
        style={{ fontSize: `${size}cqw`, letterSpacing: "-0.01em" }}
      >
        {title}
      </span>
      <span className="line-clamp-2 px-[10%] pb-[11%] font-semibold uppercase leading-tight" style={{ fontSize: "5.2cqw", letterSpacing: "0.08em", opacity: 0.85 }}>
        {foot || " "}
      </span>
    </span>
  );
}
