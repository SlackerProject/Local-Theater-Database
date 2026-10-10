// Shared by the "Add a production" form (browser), its Server Actions and
// the moderation queue. FormState is what the form edits and what "Save
// draft" stores; buildBundle() turns it into the bundle that
// approve_submission() reads (see migrations 0003 and 0004).

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
  // Set when resubmitting left-out items: they're added to this live
  // production, so the show, company and year sections don't apply.
  existingProduction?: { id: string; label: string; hasLocation: boolean };
  // The submission this one fixes and resubmits (hides its "Fix and resubmit")
  resubmissionOf?: string;
  // editing: the "new record" details panel is open (false once Done is pressed).
  // Optional on show and organization because drafts saved before it existed lack it.
  show: { query: string; choice: Choice; type: ShowType | ""; subtitle: string; authors?: string; editing?: boolean };
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
// Bundles: the shapes approve_submission() expects
// ---------------------------------------------------------------------
export type Ref<New> = { id: string; label: string } | { new: New };
export type NewShow = { title: string; type: ShowType; subtitle?: string; authors?: string };
export type NewOrganization = { name: string; town?: string; website_url?: string };
export type NewLocation = { name: string; street_address?: string; town?: string };
export type BundlePerformance = { date: string; time: string; label?: string };
export type BundlePerson =
  | { key: string; id: string; label: string }
  | { key: string; new: { display_name: string; adult_confirmed: true } };
export type BundleCredit = { kind: "cast" | "crew"; role: string; person_key: string };

type BundleItems = {
  version: 1;
  resubmission_of?: string; // ignored by the database; used by "Your submissions"
  location: Ref<NewLocation> | null;
  performances: BundlePerformance[];
  people: BundlePerson[];
  credits: BundleCredit[];
};

// A whole new production
export type NewProductionBundle = BundleItems & {
  show: Ref<NewShow>;
  organization: Ref<NewOrganization>;
  production: { year: number; opening_date: string | null; closing_date: string | null; display_title: string };
};

// More cast, crew, performances (or its location) for a live production
export type AddToProductionBundle = BundleItems & {
  production: { id: string; display_title: string };
};

export type Bundle = NewProductionBundle | AddToProductionBundle;

// What a moderator leaves out; the contributor can fix and resubmit it
export type LeftOut = {
  location: Ref<NewLocation> | null;
  performances: BundlePerformance[];
  people: BundlePerson[];
  credits: BundleCredit[];
};

export function isAddTo(b: Bundle): b is AddToProductionBundle {
  return "id" in b.production;
}

export function isEmptyLeftOut(l: LeftOut | null | undefined) {
  return !l || (!l.location && !l.performances?.length && !l.credits?.length);
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function isBlankCredit(c: CreditRow) {
  return !clean(c.role) && !clean(c.person);
}

export function showTitle(s: FormState) {
  if (s.existingProduction) return s.existingProduction.label;
  return s.show.choice.kind === "existing" ? s.show.choice.match.label : clean(s.show.query);
}

export function displayTitle(s: FormState) {
  if (s.existingProduction) return s.existingProduction.label;
  const title = showTitle(s) || "Untitled";
  return /^\d{4}$/.test(s.year.trim()) ? `${title} (${s.year.trim()})` : title;
}

// Returns a list of problems (empty = ready to submit) and the bundle.
export function buildBundle(s: FormState): { problems: string[]; bundle: Bundle | null } {
  const problems: string[] = [];
  const existing = s.existingProduction;

  // Show
  let show: Ref<NewShow> | null = null;
  if (!existing) {
    if (s.show.choice.kind === "existing") {
      show = { id: s.show.choice.match.id, label: s.show.choice.match.label };
    } else if (s.show.choice.kind === "new" && clean(s.show.query)) {
      if (!s.show.type) problems.push("Choose what kind of show it is (musical, play…).");
      else
        show = {
          new: {
            title: clean(s.show.query),
            type: s.show.type,
            ...(clean(s.show.subtitle) && { subtitle: clean(s.show.subtitle) }),
            ...(clean(s.show.authors ?? "") && { authors: clean(s.show.authors ?? "") }),
          },
        };
    } else {
      problems.push("Pick the show, or add it as a new one.");
    }
  }

  // Company
  let organization: Ref<NewOrganization> | null = null;
  if (!existing) {
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
  }

  // Location (optional; for a live production only if it has none yet)
  let location: Ref<NewLocation> | null = null;
  if (!existing?.hasLocation) {
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
  }

  // When
  const year = Number(s.year.trim());
  if (!existing && (!/^\d{4}$/.test(s.year.trim()) || year < 1800 || year > 2100)) {
    problems.push("Enter the production’s year, like 2026.");
  }
  const opening = s.openingDate && DATE_RE.test(s.openingDate) ? s.openingDate : null;
  const closing = s.closingDate && DATE_RE.test(s.closingDate) ? s.closingDate : null;
  if (!existing && opening && closing && closing < opening) problems.push("The closing date is before the opening date.");

  const performances: BundlePerformance[] = [];
  for (const p of s.performances) {
    if (!DATE_RE.test(p.date) || !TIME_RE.test(p.time)) {
      problems.push("Every performance needs a date and a time.");
      break;
    }
    performances.push({ date: p.date, time: p.time, ...(clean(p.label) && { label: clean(p.label) }) });
  }

  // People and credits. The same new name used twice is one new person.
  const people: BundlePerson[] = [];
  const keyFor = new Map<string, string>();
  const credits: BundleCredit[] = [];
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

  if (existing && !location && !performances.length && !credits.length && !problems.length) {
    problems.push("Add at least one cast or crew member, performance or the location.");
  }

  if (problems.length) return { problems, bundle: null };
  const resubmission = s.resubmissionOf ? { resubmission_of: s.resubmissionOf } : {};

  if (existing) {
    return {
      problems,
      bundle: {
        version: 1,
        ...resubmission,
        production: { id: existing.id, display_title: existing.label },
        location,
        performances,
        people,
        credits,
      },
    };
  }

  return {
    problems,
    bundle: {
      version: 1,
      ...resubmission,
      show: show!,
      organization: organization!,
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

  const live = s.existingProduction;
  return {
    show: live ? "Existing" : status(s.show.choice, !!clean(s.show.query)),
    production: live ? "Existing" : "New",
    company: live ? "Existing" : status(s.organization.choice, !!clean(s.organization.query)),
    location: live?.hasLocation ? "Existing" : status(s.location.choice, !!clean(s.location.query)),
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

// ---------------------------------------------------------------------
// Checking a bundle a moderator edited (the database re-checks too)
// ---------------------------------------------------------------------
export function checkBundle(b: Bundle): string[] {
  const problems: string[] = [];
  const blank = (s: string | undefined) => !s || !clean(s);

  if (!isAddTo(b)) {
    if ("new" in b.show && blank(b.show.new.title)) problems.push("The show needs a title.");
    if ("new" in b.organization && blank(b.organization.new.name)) problems.push("The company needs a name.");
    if (!Number.isInteger(b.production.year) || b.production.year < 1800 || b.production.year > 2100) {
      problems.push("The year should look like 2026.");
    }
    const { opening_date: o, closing_date: c } = b.production;
    if ((o && !DATE_RE.test(o)) || (c && !DATE_RE.test(c))) problems.push("Opening and closing need full dates.");
    if (o && c && c < o) problems.push("The closing date is before the opening date.");
  }
  if (b.location && "new" in b.location && blank(b.location.new.name)) problems.push("The location needs a name.");
  if (b.performances.some((p) => !DATE_RE.test(p.date) || !TIME_RE.test(p.time))) {
    problems.push("Every performance needs a date and a time.");
  }
  if (b.credits.some((c) => blank(c.role))) problems.push("Every cast and crew line needs a role.");
  const keys = new Set(b.people.map((p) => p.key));
  if (b.credits.some((c) => !keys.has(c.person_key))) problems.push("A cast or crew line is missing its person.");
  if (b.people.some((p) => "new" in p && blank(p.new.display_name))) problems.push("Every new person needs a name.");
  return problems;
}

// ---------------------------------------------------------------------
// Bundle -> FormState, for "Fix and resubmit"
// ---------------------------------------------------------------------
function matchFrom(ref: { id: string; label: string }): Match {
  return { id: ref.id, slug: "", label: ref.label, detail: "" };
}

function itemsToForm(
  form: FormState,
  items: { location: Ref<NewLocation> | null; performances: BundlePerformance[]; people: BundlePerson[]; credits: BundleCredit[] },
): FormState {
  const loc = items.location;
  if (loc) {
    form.location =
      "new" in loc
        ? {
            query: loc.new.name,
            choice: { kind: "new" },
            address: loc.new.street_address ?? "",
            town: loc.new.town ?? "",
            editing: true,
          }
        : { query: loc.label, choice: { kind: "existing", match: matchFrom(loc) }, address: "", town: "", editing: false };
  }
  form.performances = items.performances.map((p) => ({ id: newId(), date: p.date, time: p.time, label: p.label ?? "" }));
  const byKey = new Map(items.people.map((p) => [p.key, p]));
  form.credits = items.credits.map((c) => {
    const person = byKey.get(c.person_key);
    const row = { ...emptyCredit(c.kind), role: c.role };
    if (!person) return row;
    return "new" in person
      ? { ...row, person: person.new.display_name, choice: { kind: "new" as const }, adultConfirmed: true }
      : { ...row, person: person.label, choice: { kind: "existing" as const, match: matchFrom(person) } };
  });
  if (!form.credits.length) form.credits = [emptyCredit("cast")];
  return form;
}

// A rejected submission, reopened as it was submitted
export function bundleToFormState(b: Bundle, defaultYear: string, liveHasLocation = false): FormState {
  const form = emptyFormState(defaultYear);
  if (isAddTo(b)) {
    form.existingProduction = { id: b.production.id, label: b.production.display_title, hasLocation: liveHasLocation };
  } else {
    const { show, organization: org, production } = b;
    form.show =
      "new" in show
        ? { query: show.new.title, choice: { kind: "new" }, type: show.new.type, subtitle: show.new.subtitle ?? "", authors: show.new.authors ?? "", editing: true }
        : { query: show.label, choice: { kind: "existing", match: matchFrom(show) }, type: "", subtitle: "" };
    form.organization =
      "new" in org
        ? { query: org.new.name, choice: { kind: "new" }, town: org.new.town ?? "", website: org.new.website_url ?? "", editing: true }
        : { query: org.label, choice: { kind: "existing", match: matchFrom(org) }, town: "", website: "" };
    form.year = String(production.year);
    form.openingDate = production.opening_date ?? "";
    form.closingDate = production.closing_date ?? "";
  }
  return itemsToForm(form, b);
}

// Items a moderator left out, reopened as additions to the live production
export function leftOutToFormState(
  leftOut: LeftOut,
  production: { id: string; label: string; hasLocation: boolean },
  defaultYear: string,
): FormState {
  const form = emptyFormState(defaultYear);
  form.existingProduction = production;
  return itemsToForm(form, leftOut);
}
