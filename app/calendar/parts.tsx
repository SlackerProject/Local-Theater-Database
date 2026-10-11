import Link from "next/link";
import { swatch, type ShowColors } from "@/lib/palette";
import { localDay, localTime } from "@/lib/calendar";

// The calendar's drawing pieces (app/calendar/page.tsx fetches the data)

// ---------------------------------------------------------------------
// Plain calendar-date arithmetic on "YYYY-MM-DD" strings (no time zones)
// ---------------------------------------------------------------------
export const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
export const toKey = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => toKey(new Date(toDate(d).getTime() + n * 86400000));
export const dayOfWeek = (d: string) => toDate(d).getUTCDay(); // 0 = Sunday
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
export const monthName = (month: string) =>
  toDate(`${month}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
export const shortDate = (d: string) => toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export type Run = {
  id: string;
  slug: string;
  title: string; //   "Little Women (2026)"
  showTitle: string;
  company: string;
  start: string;
  end: string;
  colors: ShowColors;
  followed: boolean; // dashed: involves someone you follow, not saved
  because: string | null; // "Jane Doe is in this"
  poster: string | null;
  venue: string | null;
};

export type Going = {
  performanceId: string;
  run: Run;
  date: string;
  startsAt: string;
};

// A session of auditions you asked to be reminded about
export type AuditionEvent = {
  id: string;
  slug: string;
  title: string; // "Little Women (2026)"
  showTitle: string;
  date: string;
  startsAt: string;
  place: string | null;
};

const auditionChip =
  "link-quiet mx-1 mt-0.5 flex h-[26px] items-center overflow-hidden whitespace-nowrap rounded-md border border-dotted border-ink bg-soft px-2 text-[12.5px] font-bold";

// ---------------------------------------------------------------------
// One week of the desktop grid: day numbers, then bars in lanes, then
// going chips, then audition sessions
// ---------------------------------------------------------------------
export function Week({
  week,
  month,
  today,
  runs,
  going,
  auditions = [],
}: {
  week: string[];
  month: string;
  today: string;
  runs: Run[];
  going: Going[];
  auditions?: AuditionEvent[];
}) {
  const [start, end] = [week[0], week[6]];
  const segments = runs
    .filter((r) => r.start <= end && r.end >= start)
    .map((r) => {
      const from = r.start > start ? r.start : start;
      const to = r.end < end ? r.end : end;
      return { r, col: daysBetween(start, from) + 1, span: daysBetween(from, to) + 1, opens: r.start >= start, closes: r.end <= end };
    });

  // Greedy lanes: each bar takes the first row where it doesn't overlap
  const lanes: number[][] = [];
  const placed = segments.map((s) => {
    let lane = lanes.findIndex((cols) => cols.every((c) => c < s.col || c >= s.col + s.span));
    if (lane === -1) lane = lanes.push([]) - 1;
    for (let c = s.col; c < s.col + s.span; c++) lanes[lane].push(c);
    return { ...s, lane };
  });
  const chips = going.filter((g) => g.date >= start && g.date <= end);
  const sessions = auditions.filter((a) => a.date >= start && a.date <= end);
  const chipRow = 2 + lanes.length;
  const auditionRow = chipRow + (chips.length ? 1 : 0);
  const rows = 1 + lanes.length + (chips.length ? 1 : 0) + (sessions.length ? 1 : 0);

  return (
    <div className="grid min-h-[124px] grid-cols-7 content-start gap-y-1 border-t border-rule pb-2.5">
      {[2, 3, 4, 5, 6, 7].map((c) => (
        <div key={c} aria-hidden="true" className="border-l border-rule" style={{ gridColumn: c, gridRow: `1 / ${rows + 1}` }} />
      ))}
      {week.map((d, i) => {
        const inMonth = d.startsWith(month);
        const isToday = d === today;
        return (
          <div key={d} className="px-2 pb-0.5 pt-1.5 text-sm font-semibold" style={{ gridColumn: i + 1, gridRow: 1, color: inMonth ? "#141414" : "#ABABAB" }}>
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${isToday ? "bg-ink text-white" : ""}`}
              aria-current={isToday ? "date" : undefined}
            >
              {Number(d.slice(8))}
            </span>
          </div>
        );
      })}
      {placed.map(({ r, col, span, opens, closes, lane }) => {
        const sw = swatch(r.colors);
        const style: React.CSSProperties = r.followed
          ? { background: "#FFFFFF", color: "#5E5E5E", border: "1.5px dashed #A8A8A8" }
          : { background: sw.background, color: sw.ink, border: `1px solid ${sw.borderColor}` };
        if (!opens) style.borderLeft = 0;
        if (!closes) style.borderRight = 0;
        return (
          <Link
            key={r.id}
            href={`/production/${r.slug}`}
            title={`${r.title} · ${r.company} · ${shortDate(r.start)} – ${shortDate(r.end)}`}
            className="link-quiet flex h-[26px] items-center overflow-hidden text-ellipsis whitespace-nowrap px-2 text-[12.5px] font-bold"
            style={{
              ...style,
              gridColumn: `${col} / span ${span}`,
              gridRow: lane + 2,
              marginLeft: opens ? 4 : 0,
              marginRight: closes ? 4 : 0,
              borderRadius: `${opens ? 6 : 0}px ${closes ? 6 : 0}px ${closes ? 6 : 0}px ${opens ? 6 : 0}px`,
            }}
          >
            <span className="overflow-hidden text-ellipsis">{r.followed ? `${r.showTitle} · ${r.company}` : r.title}</span>
          </Link>
        );
      })}
      {chips.map((g) => {
        const sw = swatch(g.run.colors);
        return (
          <Link
            key={g.performanceId}
            href={`/production/${g.run.slug}`}
            title={`You’re going: ${g.run.title}`}
            className="link-quiet mx-1 mt-0.5 flex h-[30px] items-center gap-[5px] overflow-hidden whitespace-nowrap rounded-md border-2 border-ink px-2 text-[12.5px] font-bold"
            style={{ gridColumn: dayOfWeek(g.date) + 1, gridRow: chipRow, background: sw.background, color: sw.ink }}
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            <span className="overflow-hidden text-ellipsis">Going · {localTime(g.startsAt)}</span>
          </Link>
        );
      })}
      {sessions.map((a) => (
        <Link
          key={a.id}
          href={`/production/${a.slug}`}
          title={`Auditions: ${a.title} · ${localTime(a.startsAt)}${a.place ? ` · ${a.place}` : ""}`}
          className={auditionChip}
          style={{ gridColumn: dayOfWeek(a.date) + 1, gridRow: auditionRow }}
        >
          <span className="overflow-hidden text-ellipsis">
            Auditions · {a.showTitle} · {localTime(a.startsAt)}
          </span>
        </Link>
      ))}
    </div>
  );
}

// Phone: the list under the month
export function AuditionRowItem({ a }: { a: AuditionEvent }) {
  return (
    <Link href={`/production/${a.slug}`} className="link-quiet flex items-stretch gap-3 border-b border-rule py-3">
      <span aria-hidden="true" className="w-2 flex-none rounded-[3px] border border-dotted border-ink bg-soft" />
      <span className="flex min-w-0 flex-col">
        <span className="font-bold">Auditions: {a.title}</span>
        <span className="text-sm text-muted">
          {localDay(a.startsAt)} · {localTime(a.startsAt)}
          {a.place && ` · ${a.place}`}
        </span>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------
// Phone: compact month with a dot per run on each day
// ---------------------------------------------------------------------
export function MiniMonth({
  weeks,
  month,
  today,
  runs,
  going,
  auditions = [],
}: {
  weeks: string[][];
  month: string;
  today: string;
  runs: Run[];
  going: Going[];
  auditions?: AuditionEvent[];
}) {
  const goingByDay = new Map(going.map((g) => [g.date, g]));
  const auditionDays = new Set(auditions.map((a) => a.date));
  return (
    <div className="grid grid-cols-7 gap-y-1.5">
      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
        <div key={i} className="pb-1 text-center text-[13px] font-bold text-muted">
          {d}
        </div>
      ))}
      {weeks.flat().map((d) => {
        const inMonth = d.startsWith(month);
        const g = goingByDay.get(d);
        const dayRuns = inMonth ? runs.filter((r) => r.start <= d && r.end >= d) : [];
        const isToday = d === today;
        const sw = g && swatch(g.run.colors);
        const day = (
          <span
            className={`inline-flex h-[34px] w-[34px] items-center justify-center rounded-full text-[15px] font-semibold ${isToday && !g ? "bg-ink text-white" : ""}`}
            style={{
              color: inMonth ? (isToday && !g ? "#FFFFFF" : "#141414") : "#ABABAB",
              ...(sw && { background: sw.background, color: sw.ink, boxShadow: "inset 0 0 0 2px #141414" }),
            }}
          >
            {Number(d.slice(8))}
          </span>
        );
        return (
          <div key={d} className="flex flex-col items-center gap-1">
            {g ? (
              <Link href={`/production/${g.run.slug}`} aria-label={`${localDay(g.startsAt)}: you’re going to ${g.run.title}`} className="link-quiet">
                {day}
              </Link>
            ) : (
              day
            )}
            <span aria-hidden="true" className="flex h-[7px] gap-[3px]">
              {dayRuns.slice(0, 3).map((r) => {
                const s = swatch(r.colors);
                return r.followed ? (
                  <span key={r.id} className="h-[7px] w-[6px] rounded-[2px] border border-dashed border-[#8A8A8A]" />
                ) : (
                  <span key={r.id} className="h-[7px] w-[7px] rounded-full border" style={{ background: s.background, borderColor: s.borderColor }} />
                );
              })}
              {inMonth && auditionDays.has(d) && <span className="h-[7px] w-[7px] rounded-[2px] border border-dotted border-ink bg-soft" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function GoingCard({ g }: { g: Going }) {
  const sw = swatch(g.run.colors);
  return (
    <Link
      href={`/production/${g.run.slug}`}
      className="link-quiet flex items-center gap-3 rounded-lg border-2 border-ink p-2.5"
      style={{ background: sw.background, color: sw.ink }}
    >
      {g.run.poster ? (
        <img src={g.run.poster} alt={`${g.run.showTitle} poster`} className="w-14 flex-none rounded-[4px]" />
      ) : (
        <span aria-hidden="true" className="flex aspect-[4/5] w-14 flex-none items-center justify-center rounded-[4px] border border-rule bg-white p-1 text-center text-[10px] font-extrabold text-muted">
          {g.run.showTitle}
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="font-bold">{g.run.title}</span>
        <span className="text-[15px]">
          {localDay(g.startsAt)} · {localTime(g.startsAt)}
        </span>
        {g.run.venue && <span className="text-sm">{g.run.venue}</span>}
      </span>
    </Link>
  );
}

export function RunRow({ r }: { r: Run }) {
  const sw = swatch(r.colors);
  return (
    <Link href={`/production/${r.slug}`} className="link-quiet flex items-stretch gap-3 border-b border-rule py-3">
      {r.followed ? (
        <span aria-hidden="true" className="w-1.5 flex-none rounded-[3px] border-[1.5px] border-dashed border-[#8A8A8A]" />
      ) : (
        <span aria-hidden="true" className="w-2 flex-none rounded-[3px] border" style={{ background: sw.background, borderColor: sw.borderColor }} />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="font-bold">{r.title}</span>
        <span className="text-sm text-muted">
          {shortDate(r.start)} – {shortDate(r.end)}
          {r.company && ` · ${r.company}`}
        </span>
        {r.because && <span className="text-sm">{r.because}</span>}
      </span>
    </Link>
  );
}
