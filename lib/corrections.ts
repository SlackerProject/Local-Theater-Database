// Corrections (migration 0013): BoardGameGeek-style edit pages for
// productions, people, companies, shows and venues, and the moderators'
// review of them. Shared by the edit form and the review screen.

export type PageKind = "production" | "person" | "company" | "show" | "venue";
export type PageTable = "productions" | "people" | "organizations" | "shows" | "locations";

export const KINDS: Record<PageKind, { table: PageTable; noun: string }> = {
  production: { table: "productions", noun: "production" },
  person: { table: "people", noun: "person" },
  company: { table: "organizations", noun: "company" },
  show: { table: "shows", noun: "show" },
  venue: { table: "locations", noun: "venue" },
};

export const KIND_FOR_TABLE: Record<PageTable, PageKind> = {
  productions: "production",
  people: "person",
  organizations: "company",
  shows: "show",
  locations: "venue",
};

export type FieldInput = "text" | "longtext" | "number" | "date" | "url" | "state" | "town" | "zip" | "street" | "showType" | "company" | "venue";

export type FieldDef = { key: string; label: string; input: FieldInput; hint?: string; required?: boolean };

// Mirrors correction_fields() in the database
export const FIELDS: Record<PageTable, FieldDef[]> = {
  productions: [
    { key: "title_override", label: "Billed as", input: "text", hint: "Only if the poster uses a different title from the show’s." },
    { key: "year", label: "Year", input: "number", required: true },
    { key: "organization_id", label: "Company", input: "company", required: true },
    { key: "location_id", label: "Venue", input: "venue" },
    { key: "opening_date", label: "Opening date", input: "date" },
    { key: "closing_date", label: "Closing date", input: "date" },
    { key: "ticket_url", label: "Tickets link", input: "url" },
    { key: "description", label: "Description", input: "longtext" },
  ],
  people: [
    { key: "display_name", label: "Name", input: "text", required: true, hint: "As it appears in programs." },
    { key: "bio", label: "Bio", input: "longtext" },
  ],
  organizations: [
    { key: "name", label: "Name", input: "text", required: true },
    { key: "short_name", label: "Short name", input: "text", hint: "e.g. initials people use, like WFL." },
    { key: "town", label: "City or town", input: "town", hint: "Pick from the Massachusetts list. Villages belong to their town (East Walpole is in Walpole)." },
    { key: "state", label: "State", input: "state" },
    { key: "website_url", label: "Website", input: "url" },
    { key: "founded_year", label: "Founded", input: "number" },
    { key: "description", label: "About", input: "longtext" },
  ],
  shows: [
    { key: "title", label: "Title", input: "text", required: true },
    { key: "subtitle", label: "Subtitle", input: "text", hint: "e.g. The Broadway Musical" },
    { key: "type", label: "Type", input: "showType", required: true },
    { key: "authors", label: "Written by", input: "text", hint: "e.g. Book by …, Music by …, Lyrics by …" },
    { key: "premiere_year", label: "First produced", input: "number" },
    { key: "synopsis", label: "Synopsis", input: "longtext" },
  ],
  locations: [
    { key: "name", label: "Name", input: "text", required: true },
    { key: "street_address", label: "Street address", input: "street", hint: "Number and street only, e.g. 2 Scout Road. The town goes below." },
    { key: "town", label: "City or town", input: "town", hint: "Pick from the Massachusetts list. Villages belong to their town (East Walpole is in Walpole)." },
    { key: "state", label: "State", input: "state" },
    { key: "postal_code", label: "ZIP code", input: "zip", hint: "5 digits, e.g. 02081." },
    { key: "seating_capacity", label: "Seats", input: "number" },
    { key: "description", label: "About", input: "longtext" },
  ],
};

export type FieldValue = string | number | null;

export type CreditAdd = {
  kind: "cast" | "crew";
  role: string;
  person_id?: string;
  person_label?: string; // for the review screen
  new_name?: string;
  adult_confirmed?: boolean;
  // A new person who shares a name with someone already on the site, confirmed
  // as a different person (otherwise they're linked to the existing page)
  distinct?: boolean;
  // Cast: covers the role rather than playing it
  understudy?: boolean;
};
export type PerformanceEdit = { id?: string; date: string; time: string; label: string; cancelled?: boolean };

// A show's roles (show_characters), cast or not; shared by its productions
export type RoleChanges = { add?: string[]; rename?: { id: string; name: string }[]; remove?: string[] };

export type Changes = {
  fields?: Record<string, FieldValue>;
  credits?: { add?: CreditAdd[]; remove?: string[]; update?: { id: string; role: string }[] };
  performances?: { add?: PerformanceEdit[]; remove?: string[]; update?: (PerformanceEdit & { id: string })[] };
  roles?: RoleChanges;
};

// Older person suggestions stored {"display_name": ...} at the top level
export function normalizeChanges(raw: unknown): Changes {
  const c = (raw ?? {}) as Record<string, unknown>;
  if ("fields" in c || "credits" in c || "performances" in c || "roles" in c) return c as Changes;
  return { fields: c as Record<string, FieldValue> };
}

export function hasChanges(c: Changes) {
  return (
    Object.keys(c.fields ?? {}).length > 0 ||
    !!c.credits?.add?.length ||
    !!c.credits?.remove?.length ||
    !!c.credits?.update?.length ||
    !!c.performances?.add?.length ||
    !!c.performances?.remove?.length ||
    !!c.performances?.update?.length ||
    !!c.roles?.add?.length ||
    !!c.roles?.rename?.length ||
    !!c.roles?.remove?.length
  );
}

// "2026-10-30T23:30:00Z" -> "Fri, Oct 30, 2026, 7:30 PM" (Massachusetts time)
export function performanceText(date: string, time: string) {
  if (!date) return "";
  const [h, m] = (time || "19:30").split(":").map(Number);
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const clock = new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  return `${day}, ${clock}`;
}
