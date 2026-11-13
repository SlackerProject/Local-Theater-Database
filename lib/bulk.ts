// Bulk upload (moderators): the template's columns, reading a filled-in
// spreadsheet into productions and credits, and building each production's
// submission bundle once names are matched to the site.
//
// The format is built to be filled in by an AI tool as well as by hand:
// two tabs joined by a short Ref (P1, P2…), one fact per cell, fixed words
// (Cast/Crew, Yes/blank), dates as YYYY-MM-DD.

import { maTown } from "@/lib/ma-towns";
import {
  SHOW_TYPES,
  personNameKey,
  type BundleCredit,
  type BundlePerformance,
  type BundlePerson,
  type NewProductionBundle,
  type ShowType,
} from "@/lib/submission";

// ---------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------
export type ColumnSpec = { key: string; header: string; required: boolean; help: string; example: string; aliases?: string[] };

export const PRODUCTION_COLUMNS: ColumnSpec[] = [
  { key: "ref", header: "Ref", required: true, help: "A short code for this production, used again on the Credits tab. P1, P2, P3…", example: "P1" },
  { key: "show", header: "Show title", required: true, help: "The show’s title only, without the year or company.", example: "Into the Woods", aliases: ["show", "title"] },
  { key: "showType", header: "Show type", required: false, help: "Musical, Play, Opera, Revue or Other.", example: "Musical", aliases: ["type"] },
  { key: "authors", header: "Authors", required: false, help: "Who wrote it, as on the program.", example: "Music and lyrics by Stephen Sondheim; book by James Lapine" },
  { key: "year", header: "Year", required: true, help: "The year it opened, four digits.", example: "2019" },
  { key: "company", header: "Company", required: true, help: "The theater company’s full name.", example: "The Footlight Club", aliases: ["theater company", "organization"] },
  { key: "companyTown", header: "Company town", required: false, help: "The company’s home town in Massachusetts (only needed if the company is new to the site).", example: "Boston" },
  { key: "venue", header: "Venue", required: false, help: "Where it was performed, the venue’s name.", example: "Eliot Hall", aliases: ["location", "theater"] },
  { key: "venueAddress", header: "Venue address", required: false, help: "Street address (only needed if the venue is new to the site).", example: "7A Eliot Street" },
  { key: "venueTown", header: "Venue town", required: false, help: "The venue’s town in Massachusetts (only needed if the venue is new).", example: "Boston" },
  { key: "opening", header: "Opening date", required: false, help: "YYYY-MM-DD.", example: "2019-03-08", aliases: ["opening", "opened", "start date"] },
  { key: "closing", header: "Closing date", required: false, help: "YYYY-MM-DD.", example: "2019-03-23", aliases: ["closing", "closed", "end date"] },
  {
    key: "performances",
    header: "Performances",
    required: false,
    help: "Optional. Each performance as YYYY-MM-DD HH:MM (24-hour), separated by semicolons.",
    example: "2019-03-08 20:00; 2019-03-09 14:00; 2019-03-09 20:00",
  },
  { key: "tickets", header: "Tickets link", required: false, help: "Where to buy tickets (a web address), if known.", example: "https://footlight.org/tickets", aliases: ["tickets", "ticket url", "ticket link"] },
  { key: "source", header: "Source", required: false, help: "Where this came from: a web page or program. Kept with the record for moderators.", example: "https://footlight.org/history" },
];

export const CREDIT_COLUMNS: ColumnSpec[] = [
  { key: "ref", header: "Ref", required: true, help: "The production’s Ref from the Productions tab.", example: "P1" },
  { key: "kind", header: "Cast or Crew", required: true, help: "Cast (on stage) or Crew (creative and production team, band).", example: "Cast", aliases: ["kind", "type", "cast crew", "category"] },
  { key: "role", header: "Role", required: true, help: "Cast: the character’s name. Crew: the position, like Director or Stage Manager. One role per row.", example: "The Baker", aliases: ["character", "position", "role or position"] },
  { key: "person", header: "Person", required: false, help: "The person’s full name as credited. Leave blank for anyone under 18.", example: "Jamie Rivera", aliases: ["name", "person name", "full name"] },
  { key: "understudy", header: "Understudy", required: false, help: "Yes if this person understudied (covered) the role; otherwise blank.", example: "" },
  { key: "young", header: "Under 18", required: false, help: "Yes if this person is under 18 today; they are credited by role only, never by name.", example: "", aliases: ["under18", "young performer", "minor"] },
];

export const AI_INSTRUCTIONS = `You are filling in a spreadsheet for Local Theater Database, a site listing community theater productions in Eastern Massachusetts. Use only facts from the sources I give you; never guess or invent anything. Leave a cell blank if you don't know it.

The file has two tabs:

PRODUCTIONS: one row per production.
- Ref: P1, P2, P3… (unique).
- Show title: the title only (no year, no company). Use the show's standard title, e.g. "Into the Woods".
- Show type: exactly Musical, Play, Opera, Revue or Other.
- Authors: optional.
- Year: four digits, the year it opened.
- Company: the company's full official name, spelled the same way on every row.
- Company town, Venue, Venue address, Venue town: towns must be Massachusetts cities or towns.
- Opening date / Closing date: YYYY-MM-DD.
- Performances: optional; "YYYY-MM-DD HH:MM" (24-hour) separated by semicolons.
- Tickets link: optional; the web address where tickets are sold.
- Source: the web page or program the facts came from.

CREDITS: one row per person per role.
- Ref: the production's Ref from the Productions tab.
- Cast or Crew: exactly Cast or Crew. Crew includes the director, music director, choreographer, designers, stage managers and band.
- Role: one role per row. Cast: the character's name. Crew: the position (Director, Music Director, Stage Manager…). Someone with two roles gets two rows.
- Person: the full name as credited, spelled the same way everywhere. Leave blank if the person is under 18.
- Understudy: Yes only if they understudied that role; otherwise blank.
- Under 18: Yes if the person is under 18 today; then leave Person blank.

Rules: one fact per cell; no notes inside cells; no merged cells; don't add, rename or reorder columns; don't add example rows.`;

// ---------------------------------------------------------------------
// Reading a filled-in file
// ---------------------------------------------------------------------
export type BulkProduction = {
  row: number; // spreadsheet row, for messages
  ref: string;
  show: string;
  showType: ShowType | null;
  authors: string;
  year: number | null;
  company: string;
  companyTown: string;
  venue: string;
  venueAddress: string;
  venueTown: string;
  opening: string | null;
  closing: string | null;
  performances: BundlePerformance[];
  tickets: string;
  source: string;
};

export type BulkCredit = { row: number; ref: string; kind: "cast" | "crew"; role: string; person: string; understudy: boolean; young: boolean };

export type BulkIssue = { sheet: "Productions" | "Credits" | "File"; row?: number; ref?: string; message: string };

export type ParsedBulk = { productions: BulkProduction[]; credits: BulkCredit[]; issues: BulkIssue[] };

export type Cell = string | number | boolean | Date | null | undefined;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const headerKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const text = (v: Cell) => (v === null || v === undefined ? "" : v instanceof Date ? isoDate(v) : squash(String(v)));
const YES = new Set(["yes", "y", "true", "x", "1", "✓", "✔"]);
const yes = (v: Cell) => (typeof v === "boolean" ? v : YES.has(text(v).toLowerCase()));

const pad = (n: number) => String(n).padStart(2, "0");
// Spreadsheet dates come in at midnight UTC
function isoDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function validDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// "2019-03-08", "3/8/2019", or a spreadsheet date
export function parseDate(v: Cell): string | null | undefined {
  if (v === null || v === undefined || text(v) === "") return null;
  if (v instanceof Date) return isoDate(v);
  const s = text(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m && validDate(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m && validDate(+m[3], +m[1], +m[2])) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
  return undefined; // not a date we can read
}

// "19:30", "7:30 PM", "7pm"
export function parseTime(s: string): string | undefined {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return undefined;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3]) {
    if (h < 1 || h > 12) return undefined;
    if (m[3].startsWith("p") && h !== 12) h += 12;
    if (m[3].startsWith("a") && h === 12) h = 0;
  } else if (!m[2]) return undefined; // a bare "7" is ambiguous
  if (h > 23 || min > 59) return undefined;
  return `${pad(h)}:${pad(min)}`;
}

function parsePerformances(v: Cell): { list: BundlePerformance[]; bad: string[] } {
  if (v instanceof Date) {
    const t = v.getUTCHours() || v.getUTCMinutes() ? `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` : "19:30";
    return { list: [{ date: isoDate(v), time: t }], bad: [] };
  }
  const list: BundlePerformance[] = [];
  const bad: string[] = [];
  for (const part of text(v).split(/[;\n]+/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\S+)(?:\s+(?:at\s+)?(.+))?$/i);
    const date = m ? parseDate(m[1]) : undefined;
    const time = m?.[2] ? parseTime(m[2]) : "19:30";
    if (date && time) list.push({ date, time });
    else bad.push(part);
  }
  return { list, bad };
}

function parseShowType(v: Cell): ShowType | null | undefined {
  const s = text(v).toLowerCase();
  if (!s) return null;
  return SHOW_TYPES.find((t) => t.value === s || t.label.toLowerCase() === s)?.value ?? undefined;
}

function parseKind(v: Cell): "cast" | "crew" | undefined {
  const s = text(v).toLowerCase();
  if (["cast", "actor", "performer", "ensemble"].includes(s)) return "cast";
  if (["crew", "creative", "creative team", "production team", "production", "band", "orchestra", "staff"].includes(s)) return "crew";
  return undefined;
}

// Map the header row to column keys (case, spaces and punctuation ignored)
function columnIndex(header: Cell[], spec: ColumnSpec[]) {
  const index: Record<string, number> = {};
  header.forEach((h, i) => {
    const k = headerKey(text(h));
    if (!k) return;
    const col = spec.find((c) => headerKey(c.header) === k || headerKey(c.key) === k || c.aliases?.some((a) => headerKey(a) === k));
    if (col && index[col.key] === undefined) index[col.key] = i;
  });
  return index;
}

// Which tab is which: by name, or by the columns it has
export function classifySheet(name: string, rows: Cell[][]): "productions" | "credits" | null {
  const n = name.toLowerCase();
  if (n.startsWith("production")) return "productions";
  if (n.startsWith("credit") || n.includes("cast")) return "credits";
  const header = rows[0] ?? [];
  const prod = columnIndex(header, PRODUCTION_COLUMNS);
  const cred = columnIndex(header, CREDIT_COLUMNS);
  if (cred.kind !== undefined && cred.role !== undefined) return "credits";
  if (prod.show !== undefined && prod.year !== undefined) return "productions";
  return null;
}

export function parseBulk(productionRows: Cell[][] | null, creditRows: Cell[][] | null, maxYear: number): ParsedBulk {
  const issues: BulkIssue[] = [];
  const productions: BulkProduction[] = [];
  const credits: BulkCredit[] = [];
  if (!productionRows) issues.push({ sheet: "File", message: "No Productions tab was found. Use the template’s tabs and column names." });
  if (!creditRows) issues.push({ sheet: "File", message: "No Credits tab was found, so no cast or crew will be added." });

  if (productionRows) {
    const idx = columnIndex(productionRows[0] ?? [], PRODUCTION_COLUMNS);
    for (const c of PRODUCTION_COLUMNS.filter((c) => c.required)) {
      if (idx[c.key] === undefined) issues.push({ sheet: "Productions", message: `The “${c.header}” column is missing.` });
    }
    const seenRefs = new Set<string>();
    productionRows.slice(1).forEach((r, i) => {
      const row = i + 2;
      const get = (k: string) => (idx[k] === undefined ? null : r[idx[k]]);
      if (!r.some((c) => text(c))) return; // empty row
      const ref = text(get("ref")).toUpperCase();
      const problem = (message: string) => issues.push({ sheet: "Productions", row, ref: ref || undefined, message });

      if (!ref) return problem("Missing a Ref (like P1).");
      // Not tied to the first production with that Ref, which is fine
      if (seenRefs.has(ref)) return void issues.push({ sheet: "Productions", row, message: `Ref ${ref} is used again here; this row was left out. Each production needs its own Ref.` });
      seenRefs.add(ref);

      const show = text(get("show"));
      const company = text(get("company"));
      const yearText = text(get("year"));
      const opening = parseDate(get("opening"));
      const closing = parseDate(get("closing"));
      let year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;
      if (!yearText && opening) year = Number(opening.slice(0, 4));
      const showType = parseShowType(get("showType"));
      const perf = parsePerformances(get("performances"));

      if (!show) problem("Missing the show title.");
      if (!company) problem("Missing the company.");
      if (!year) problem(yearText ? `“${yearText}” isn’t a year. Use four digits, like 2019.` : "Missing the year.");
      else if (year < 1850 || year > maxYear) problem(`${year} doesn’t look right for the year.`);
      if (opening === undefined) problem(`The opening date “${text(get("opening"))}” isn’t a date. Use YYYY-MM-DD.`);
      if (closing === undefined) problem(`The closing date “${text(get("closing"))}” isn’t a date. Use YYYY-MM-DD.`);
      if (opening && closing && closing < opening) problem("The closing date is before the opening date.");
      if (showType === undefined) problem(`Show type “${text(get("showType"))}” should be Musical, Play, Opera, Revue or Other.`);
      if (perf.bad.length) problem(`These performances couldn’t be read: ${perf.bad.join("; ")}. Use YYYY-MM-DD HH:MM.`);

      productions.push({
        row,
        ref,
        show,
        showType: showType ?? null,
        authors: text(get("authors")),
        year,
        company,
        companyTown: text(get("companyTown")),
        venue: text(get("venue")),
        venueAddress: text(get("venueAddress")),
        venueTown: text(get("venueTown")),
        opening: opening ?? null,
        closing: closing ?? null,
        performances: perf.list,
        tickets: /^https?:\/\/\S+$/i.test(text(get("tickets"))) ? text(get("tickets")) : "",
        source: text(get("source")),
      });
    });
  }

  if (creditRows) {
    const idx = columnIndex(creditRows[0] ?? [], CREDIT_COLUMNS);
    for (const c of CREDIT_COLUMNS.filter((c) => c.required)) {
      if (idx[c.key] === undefined) issues.push({ sheet: "Credits", message: `The “${c.header}” column is missing.` });
    }
    const refs = new Set(productions.map((p) => p.ref));
    const seen = new Set<string>();
    creditRows.slice(1).forEach((r, i) => {
      const row = i + 2;
      const get = (k: string) => (idx[k] === undefined ? null : r[idx[k]]);
      if (!r.some((c) => text(c))) return;
      const ref = text(get("ref")).toUpperCase();
      const problem = (message: string) => issues.push({ sheet: "Credits", row, ref: ref || undefined, message });
      const kind = parseKind(get("kind"));
      const role = text(get("role"));
      const young = yes(get("young"));
      const person = young ? "" : text(get("person"));

      if (!ref) return problem("Missing the production’s Ref.");
      if (!refs.has(ref)) return problem(`Ref ${ref} isn’t on the Productions tab.`);
      if (!kind) return problem(`“${text(get("kind"))}” should be Cast or Crew.`);
      if (!role) return problem("Missing the role.");
      if (!person && !young) return problem(`No person for ${role}. Add the name, or put Yes under “Under 18”.`);
      if (young && kind !== "cast") return problem("Only cast members can be marked Under 18.");
      const key = `${ref}|${kind}|${role.toLowerCase()}|${personNameKey(person)}|${young}`;
      if (seen.has(key)) return; // the same line twice
      seen.add(key);
      credits.push({ row, ref, kind, role, person, understudy: yes(get("understudy")), young });
    });
  }
  return { productions, credits, issues };
}

// ---------------------------------------------------------------------
// Matching to the site, and building each production's bundle
// ---------------------------------------------------------------------

// "The Footlight Club" and "footlight club" are the same company
export function entityKey(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^\s*the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

export type SiteRef = { id: string; label: string };
export type BulkPreview = {
  shows: Record<string, SiteRef>; // by entityKey
  companies: Record<string, SiteRef>;
  venues: Record<string, SiteRef>;
  people: Record<string, { id: string; label: string; slug: string; detail: string | null }[]>; // by personNameKey
  existing: Record<string, { id: string; slug: string; label: string; credits: number; performances: number }>; // by Ref
  positions: string[];
};

// Entities made earlier in this upload (later productions reuse them)
export type Created = { shows: Record<string, SiteRef>; companies: Record<string, SiteRef>; venues: Record<string, SiteRef>; people: Record<string, SiteRef> };

export const townFor = (value: string) => (value ? maTown(value) : null);

export function buildBulkBundle(
  p: BulkProduction,
  credits: BulkCredit[],
  preview: BulkPreview,
  created: Created,
  personChoice: Record<string, string>, // nameKey -> person id, or "new"
): NewProductionBundle {
  const showKey = entityKey(p.show);
  const companyKey = entityKey(p.company);
  const venueKey = entityKey(p.venue);
  const ref = (key: string, site: Record<string, SiteRef>, made: Record<string, SiteRef>) => made[key] ?? site[key];

  const show = ref(showKey, preview.shows, created.shows);
  const company = ref(companyKey, preview.companies, created.companies);
  const venue = p.venue ? ref(venueKey, preview.venues, created.venues) : undefined;

  const people: BundlePerson[] = [];
  const keyFor = new Map<string, string>();
  const bundleCredits: BundleCredit[] = credits.map((c) => {
    if (c.young) return { kind: "cast", role: c.role, person_key: "young", young: true, ...(c.understudy && { understudy: true }) };
    const nk = personNameKey(c.person);
    let key = keyFor.get(nk);
    if (!key) {
      key = `p${keyFor.size}`;
      keyFor.set(nk, key);
      const choice = personChoice[nk];
      const made = created.people[nk];
      const match = preview.people[nk] ?? [];
      if (made) people.push({ key, id: made.id, label: made.label });
      else if (choice && choice !== "new") people.push({ key, id: choice, label: match.find((m) => m.id === choice)?.label ?? c.person });
      else people.push({ key, new: { display_name: c.person, adult_confirmed: true, ...(match.length > 0 && { distinct: true }) } });
    }
    return { kind: c.kind, role: c.role, person_key: key, ...(c.understudy && { understudy: true }) };
  });

  const title = p.show;
  return {
    version: 1,
    show: show ? { id: show.id, label: show.label } : { new: { title: p.show, type: p.showType ?? "other", ...(p.authors && { authors: p.authors }) } },
    organization: company
      ? { id: company.id, label: company.label }
      : { new: { name: p.company, ...(townFor(p.companyTown) && { town: townFor(p.companyTown)! }) } },
    production: {
      year: p.year!,
      opening_date: p.opening,
      closing_date: p.closing,
      display_title: `${title} (${p.year})`,
      ...(p.tickets && { ticket_url: p.tickets }),
    },
    location: !p.venue
      ? null
      : venue
        ? { id: venue.id, label: venue.label }
        : {
            new: {
              name: p.venue,
              ...(p.venueAddress && { street_address: p.venueAddress }),
              ...(townFor(p.venueTown) && { town: townFor(p.venueTown)! }),
            },
          },
    performances: p.performances,
    people,
    credits: bundleCredits,
  };
}
