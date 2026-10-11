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
  // Each performance (or, without a schedule, opening night)
  nights: { id: string; date: string; startsAt: string | null }[];
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

const chipBase =
  "link-quiet flex min-h-[26px] items-center gap-[5px] overflow-hidden whitespace-nowrap rounded-md px-2 text-[12.5px] font-bold";

// ---------------------------------------------------------------------
// One week of the desktop grid: each day lists its performances as chips
// in the show's colors. The night you're going is outlined in ink with a
// check; runs with people you follow are dashed; auditions are dotted.
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
  const goingIds = new Set(going.map((g) => g.performanceId));

  return (
    <div className="grid min-h-[124px] grid-cols-7 border-t border-rule">
      {week.map((d, i) => {
        const inMonth = d.startsWith(month);
        const isToday = d === today;
        // Going first, then saved shows, then runs with people you follow
        const nights = runs
          .flatMap((r) => r.nights.filter((n) => n.date === d).map((n) => ({ r, n, going: goingIds.has(n.id) })))
          .sort((a, b) => Number(b.going) - Number(a.going) || Number(a.r.followed) - Number(b.r.followed) || (a.n.startsAt ?? "").localeCompare(b.n.startsAt ?? ""));
        const sessions = auditions.filter((a) => a.date === d);
        return (
          <div key={d} className={`flex min-w-0 flex-col gap-1 px-1 pb-2 ${i ? "border-l border-rule" : ""}`}>
            <div className="px-1 pt-1.5 text-sm font-semibold" style={{ color: inMonth ? "#141414" : "#ABABAB" }}>
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${isToday ? "bg-ink text-white" : ""}`}
                aria-current={isToday ? "date" : undefined}
              >
                {Number(d.slice(8))}
              </span>
            </div>
            {nights.map(({ r, n, going: isGoing }) => {
              const sw = swatch(r.colors);
              const time = n.startsAt ? localTime(n.startsAt) : null;
              const style: React.CSSProperties = isGoing
                ? { background: sw.background, color: sw.ink, border: "2px solid #141414", minHeight: 30 }
                : r.followed
                  ? { background: "#FFFFFF", color: "#5E5E5E", border: "1.5px dashed #A8A8A8" }
                  : { background: sw.background, color: sw.ink, border: `1px solid ${sw.borderColor}` };
              return (
                <Link
                  key={n.id}
                  href={`/production/${r.slug}`}
                  title={`${isGoing ? "You’re going: " : ""}${r.title} · ${r.company}${time ? ` · ${time}` : ""}${r.because ? ` · ${r.because}` : ""}`}
                  className={chipBase}
                  style={style}
                >
                  {isGoing && (
                    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                  <span className="flex min-w-0 flex-col py-0.5 leading-tight">
                    <span className="overflow-hidden text-ellipsis">{r.showTitle}</span>
                    <span className="text-[11.5px] font-semibold">{isGoing ? `Going · ${time}` : (time ?? "Opens")}</span>
                  </span>
                </Link>
              );
            })}
            {sessions.map((a) => (
              <Link
                key={a.id}
                href={`/production/${a.slug}`}
                title={`Auditions: ${a.title} · ${localTime(a.startsAt)}${a.place ? ` · ${a.place}` : ""}`}
                className={`${chipBase} border border-dotted border-ink bg-soft`}
              >
                <span className="flex min-w-0 flex-col py-0.5 leading-tight">
                  <span className="overflow-hidden text-ellipsis">{a.showTitle}</span>
                  <span className="text-[11.5px] font-semibold">Auditions · {localTime(a.startsAt)}</span>
                </span>
              </Link>
            ))}
          </div>
        );
      })}
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
// Phone: compact month with a dot for each show performing that day
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
        const dayRuns = inMonth ? runs.filter((r) => r.nights.some((n) => n.date === d)) : [];
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
