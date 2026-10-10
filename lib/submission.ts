// Shared by the "Add a production" form (browser) and its Server Actions.
// FormState is what the form edits and what "Save draft" stores;
// buildBundle() turns it into the bundle that approve_submission() reads.

export type ShowType = "musical" | "play" | "opera" | "revue" | "other";
export const SHOW_TYPES: { value: ShowType; label: string }[] = [
  { value: "musical", label: "Musical" },
  { value: "play", label: "Play" },
  { value: "opera", label: "Opera" },
  { value: "revue", label: "Revue" },
  { value: "other", label: "Other" },
];

export type Match = { id: string; slug: string; label: string; detail: string };

// What a type-ahead field currently points at
export type Choice =
  | { kind: "none" } //            still typing
  | { kind: "existing"; match: Match }
  | { kind: "new" }
  | { kind: "suggest"; match: Match }; // people only: "Did you mean…?"

export type Performance = { id: string; date: string; time: string; label: string; editing?: boolean };

export type CreditRow = {
  id: string;
  kind: "cast" | "crew";
  role: string;
  person: string; //  the name as typed
  choice: Choice;
  adultConfirmed: boolean;
};

export type FormState = {
  version: 1;
  // editing: the "new record" details panel is open (false once Done is pressed).
  // Optional on show and organization because drafts saved before it existed lack it.
  show: { query: string; choice: Choice; type: ShowType | ""; subtitle: string; editing?: boolean };
  organization: { query: string; choice: Choice; town: string; website: string; editing?: boolean };
  location: { query: string; choice: Choice; address: string; town: string; editing: boolean };
  year: string;
  openingDate: string;
  closingDate: string;
  performances: Performance[];
  credits: CreditRow[];
};

// defaultYear comes from the server per visit (reading the clock while
// rendering a Client Component would freeze it at build time)
export function emptyFormState(defaultYear: string): FormState {
  return {
    version: 1,
    show: { query: "", choice: { kind: "none" }, type: "", subtitle: "", editing: true },
    organization: { query: "", choice: { kind: "none" }, town: "", website: "", editing: true },
    location: { query: "", choice: { kind: "none" }, address: "", town: "", editing: true },
    year: defaultYear,
    openingDate: "",
    closingDate: "",
    performances: [],
    // Fixed id: this row renders on the server too, so it can't be random
    credits: [emptyCredit("cast", "c0")],
  };
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyCredit(kind: "cast" | "crew", id = newId()): CreditRow {
  return { id, kind, role: "", person: "", choice: { kind: "none" }, adultConfirmed: false };
}

// ---------------------------------------------------------------------
// Bundle: the shape approve_submission() expects (see migration 0003)
// ---------------------------------------------------------------------
type Ref<New> = { id: string; label: string } | { new: New };

export type Bundle = {
  version: 1;
  show: Ref<{ title: string; type: ShowType; subtitle?: string }>;
  organization: Ref<{ name: string; town?: string; website_url?: string }>;
  location: Ref<{ name: string; street_address?: string; town?: string }> | null;
  production: { year: number; opening_date: string | null; closing_date: string | null; display_title: string };
  performances: { date: string; time: string; label?: string }[];
  people: ({ key: string; id: string; label: string } | { key: string; new: { display_name: string; adult_confirmed: true } })[];
  credits: { kind: "cast" | "crew"; role: string; person_key: string }[];
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function isBlankCredit(c: CreditRow) {
  return !clean(c.role) && !clean(c.person);
}

export function showTitle(s: FormState) {
  return s.show.choice.kind === "existing" ? s.show.choice.match.label : clean(s.show.query);
}

export function displayTitle(s: FormState) {
  const title = showTitle(s) || "Untitled";
  return /^\d{4}$/.test(s.year.trim()) ? `${title} (${s.year.trim()})` : title;
}

// Returns a list of problems (empty = ready to submit) and the bundle.
export function buildBundle(s: FormState): { problems: string[]; bundle: Bundle | null } {
  const problems: string[] = [];

  // Show
  let show: Bundle["show"] | null = null;
  if (s.show.choice.kind === "existing") {
    show = { id: s.show.choice.match.id, label: s.show.choice.match.label };
  } else if (s.show.choice.kind === "new" && clean(s.show.query)) {
    if (!s.show.type) problems.push("Choose what kind of show it is (musical, play…).");
    else
      show = {
        new: { title: clean(s.show.query), type: s.show.type, ...(clean(s.show.subtitle) && { subtitle: clean(s.show.subtitle) }) },
      };
  } else {
    problems.push("Pick the show, or add it as a new one.");
  }

  // Company
  let organization: Bundle["organization"] | null = null;
  if (s.organization.choice.kind === "existing") {
    organization = { id: s.organization.choice.match.id, label: s.organization.choice.match.label };
  } else if (s.organization.choice.kind === "new" && clean(s.organization.query)) {
    const website = clean(s.organization.website);
    if (website && !/^https?:\/\/\S+\.\S+/i.test(website)) {
      problems.push("The company website should start with https://");
    }
    organization = {
      new: {
        name: clean(s.organization.query),
        ...(clean(s.organization.town) && { town: clean(s.organization.town) }),
        ...(website && { website_url: website }),
      },
    };
  } else {
    problems.push("Pick the theater company, or add it as a new one.");
  }

  // Location (optional)
  let location: Bundle["location"] = null;
  if (s.location.choice.kind === "existing") {
    location = { id: s.location.choice.match.id, label: s.location.choice.match.label };
  } else if (s.location.choice.kind === "new" && clean(s.location.query)) {
    location = {
      new: {
        name: clean(s.location.query),
        ...(clean(s.location.address) && { street_address: clean(s.location.address) }),
        ...(clean(s.location.town) && { town: clean(s.location.town) }),
      },
    };
  } else if (clean(s.location.query)) {
    problems.push("Pick the location, add it as a new one, or clear the field.");
  }

  // When
  const year = Number(s.year.trim());
  if (!/^\d{4}$/.test(s.year.trim()) || year < 1800 || year > 2100) {
    problems.push("Enter the production’s year, like 2026.");
  }
  const opening = s.openingDate && DATE_RE.test(s.openingDate) ? s.openingDate : null;
  const closing = s.closingDate && DATE_RE.test(s.closingDate) ? s.closingDate : null;
  if (opening && closing && closing < opening) problems.push("The closing date is before the opening date.");

  const performances: Bundle["performances"] = [];
  for (const p of s.performances) {
    if (!DATE_RE.test(p.date) || !TIME_RE.test(p.time)) {
      problems.push("Every performance needs a date and a time.");
      break;
    }
    performances.push({ date: p.date, time: p.time, ...(clean(p.label) && { label: clean(p.label) }) });
  }

  // People and credits. The same new name used twice is one new person.
  const people: Bundle["people"] = [];
  const keyFor = new Map<string, string>();
  const credits: Bundle["credits"] = [];
  let unresolved = 0;
  let unconfirmed = 0;
  let missingRole = 0;

  for (const c of s.credits) {
    if (isBlankCredit(c)) continue;
    if (!clean(c.role)) missingRole++;

    let mapKey: string | null = null;
    if (c.choice.kind === "existing") {
      mapKey = `id:${c.choice.match.id}`;
      if (!keyFor.has(mapKey)) {
        keyFor.set(mapKey, `p${keyFor.size + 1}`);
        people.push({ key: keyFor.get(mapKey)!, id: c.choice.match.id, label: c.choice.match.label });
      }
    } else if (c.choice.kind === "new" && clean(c.person)) {
      if (!c.adultConfirmed) unconfirmed++;
      mapKey = `new:${clean(c.person).toLowerCase()}`;
      if (!keyFor.has(mapKey)) {
        keyFor.set(mapKey, `p${keyFor.size + 1}`);
        people.push({ key: keyFor.get(mapKey)!, new: { display_name: clean(c.person), adult_confirmed: true } });
      }
    } else {
      unresolved++;
    }

    if (mapKey && clean(c.role)) {
      credits.push({ kind: c.kind, role: clean(c.role), person_key: keyFor.get(mapKey)! });
    }
  }
  if (missingRole) problems.push(`${missingRole} cast or crew ${missingRole === 1 ? "row needs" : "rows need"} a role.`);
  if (unresolved) problems.push(`${unresolved} ${unresolved === 1 ? "person needs" : "people need"} checking: pick an existing person or add them as new.`);
  if (unconfirmed) problems.push(`Confirm that every new person is 18 or older (${unconfirmed} to go).`);

  if (problems.length || !show || !organization) return { problems, bundle: null };

  return {
    problems,
    bundle: {
      version: 1,
      show,
      organization,
      location,
      production: { year, opening_date: opening, closing_date: closing, display_title: displayTitle(s) },
      performances,
      people,
      credits,
    },
  };
}

// The sidebar's "Your submission" counts
export function summarize(s: FormState) {
  const status = (c: Choice, hasText: boolean) =>
    c.kind === "existing" ? "Existing" : c.kind === "new" && hasText ? "New" : "—";

  const rows = s.credits.filter((c) => !isBlankCredit(c));
  const newNames = new Set<string>();
  const existingIds = new Set<string>();
  let pending = 0;
  for (const c of rows) {
    if (c.choice.kind === "existing") existingIds.add(c.choice.match.id);
    else if (c.choice.kind === "new" && clean(c.person)) newNames.add(clean(c.person).toLowerCase());
    else if (clean(c.person)) pending++;
  }
  const peopleParts = [
    newNames.size && `${newNames.size} new`,
    existingIds.size && `${existingIds.size} existing`,
    pending && `${pending} pending check`,
  ].filter(Boolean);

  return {
    show: status(s.show.choice, !!clean(s.show.query)),
    company: status(s.organization.choice, !!clean(s.organization.query)),
    location: status(s.location.choice, !!clean(s.location.query)),
    people: peopleParts.length ? peopleParts.join(" · ") : "—",
    credits: rows.length,
    performances: s.performances.length,
  };
}

// Loose structural check for drafts and submissions arriving at the server
export function looksLikeFormState(value: unknown): value is FormState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<FormState>;
  return (
    v.version === 1 &&
    !!v.show && !!v.organization && !!v.location &&
    typeof v.year === "string" &&
    Array.isArray(v.performances) &&
    Array.isArray(v.credits)
  );
}
