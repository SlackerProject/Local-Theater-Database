// Getting performances onto people's phones without email: "Add to Google
// Calendar" links, downloadable .ics files (Apple Calendar, Outlook), and a
// subscription feed. All performance times are local Massachusetts time.

export const TIME_ZONE = "America/New_York";

// How long a calendar entry lasts; we don't record running times yet
const RUNNING_TIME_MS = 150 * 60 * 1000;

export type CalendarEvent = {
  id: string; //       performance id; makes the event's UID stable across downloads
  startsAt: string; // ISO timestamp
  title: string; //    "Little Women (2026)"
  company?: string | null;
  label?: string | null; // "Opening night"
  venue?: string | null;
  address?: string | null;
  url: string; //      the production page
};

// "20261017T233000Z"
function utcStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function location(e: CalendarEvent) {
  return [e.venue, e.address].filter(Boolean).join(", ");
}

function details(e: CalendarEvent) {
  return [e.company && `${e.company}${e.label ? ` · ${e.label}` : ""}`, e.url].filter(Boolean).join("\n");
}

export function googleCalendarUrl(e: CalendarEvent) {
  const start = new Date(e.startsAt);
  const end = new Date(start.getTime() + RUNNING_TIME_MS);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details: details(e),
    location: location(e),
    ctz: TIME_ZONE,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// ---------------------------------------------------------------------
// iCalendar (RFC 5545): CRLF line endings, escaped text, lines folded at
// 75 bytes
// ---------------------------------------------------------------------
function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string) {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (bytes.encode(current + ch).length > limit) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.join("\r\n ");
}

export function icsCalendar(events: CalendarEvent[], name?: string) {
  const now = utcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Local Theater Database//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(name ? [`X-WR-CALNAME:${escapeText(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"] : []),
  ];
  for (const e of events) {
    const start = new Date(e.startsAt);
    lines.push(
      "BEGIN:VEVENT",
      `UID:performance-${e.id}@localtheaterdatabase`,
      `DTSTAMP:${now}`,
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(new Date(start.getTime() + RUNNING_TIME_MS))}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(location(e) ? [`LOCATION:${escapeText(location(e))}`] : []),
      `DESCRIPTION:${escapeText(details(e))}`,
      `URL:${e.url}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------
// Dates in Massachusetts time
// ---------------------------------------------------------------------

// The current time, for server pages deciding what's past (they render per
// request, after reading the visitor's cookies)
export function currentTime() {
  return new Date();
}

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "2026-10-17" for a timestamp, in local time
export function localDate(iso: string | Date) {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// "7:30 PM"
export function localTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
}

// "Sat, Oct 17"
export function localDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric" });
}
