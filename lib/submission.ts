// Shared by the "Add a production" form (browser), its Server Actions and
// the moderation queue. FormState is what the form edits and what "Save
// draft" stores; buildBundle() turns it into the bundle that
// approve_submission() reads (see migrations 0003 and 0004).

import { maTown } from "@/lib/ma-towns";
import { SERVICE_AREA } from "@/lib/brand";
import { readUnderstudy, splitRoles } from "@/lib/credits";

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
  // Cast: the person understudies the role(s) instead of playing them
  understudy?: boolean;
  // Cast: a young performer (under 18): the role only, no person is ever recorded
  young?: boolean;
  // A new person who shares a name with someone on the site, confirmed different
  distinct?: boolean;
};

export type FormState = {
  version: 1;
  // Set when resubmitting left-out items: they're added to this live
  // production, so the show, company and year sections don't apply.
  existingProduction?: { id: string; label: string; hasLocation: boolean };
  // The submission this one fixes and resubmits (hides its "Fix and resubmit")
  resubmissionOf?: string;
  // Step 5: a poster, already uploaded to the contributor's storage folder
  poster?: (BundlePoster & { rightsConfirmed: boolean }) | null;
  // editing: the "new record" details panel is open (false once Done is pressed).
  // Optional on show and organization because drafts saved before it existed lack it.
  show: { query: string; choice: Choice; type: ShowType | ""; subtitle: string; authors?: string; editing?: boolean };
  // inArea: the contributor confirmed a new company is in SERVICE_AREA
  organization: { query: string; choice: Choice; town: string; website: string; editing?: boolean; inArea?: boolean };
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
// distinct: a moderator confirmed a new person isn't the someone of the
// same name already on the site (otherwise approval refuses a duplicate)
export type BundlePerson =
  | { key: string; id: string; label: string }
  | { key: string; new: { display_name: string; adult_confirmed: true; distinct?: boolean } };

// A name compared without capitals, spacing or punctuation; mirrors
// person_name_key() in the database
export function personNameKey(name: string) {
  return name
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

// Someone already on the site with a new person's name
export type SameNameMatch = { id: string; label: string; slug: string; detail: string | null };
// One role each; understudy: covers the role rather than playing it
// young: a young performer (under 18), with no person (person_key is empty)
export type BundleCredit = { kind: "cast" | "crew"; role: string; person_key: string; understudy?: boolean; young?: boolean };
// An uploaded poster and the palette read from it in the browser (migration 0007)
export type BundlePoster = {
  storage_key: string;
  thumb_key: string;
  width: number;
  height: number;
  bytes: number;
  palette: { ground: string; ground2: string; ink: string; soft: string; accent: string };
};

type BundleItems = {
  version: 1;
  resubmission_of?: string; // ignored by the database; used by "Your submissions"
  poster?: BundlePoster | null;
  location: Ref<NewLocation> | null;
  performances: BundlePerformance[];
  people: BundlePerson[];
  credits: BundleCredit[];
  // Roles nobody is cast in yet, added to the show's role list on approval
  roles?: string[];
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
  poster?: BundlePoster | null;
  location: Ref<NewLocation> | null;
  performances: BundlePerformance[];
  people: BundlePerson[];
  credits: BundleCredit[];
};

export function isAddTo(b: Bundle): b is AddToProductionBundle {
  return "id" in b.production;
}

export function isEmptyLeftOut(l: LeftOut | null | undefined) {
  return !l || (!l.poster && !l.location && !l.performances?.length && !l.credits?.length);
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
      const orgTown = maTown(s.organization.town);
      if (!orgTown) problems.push("The company’s city or town isn’t a Massachusetts city or town. Check the spelling; villages belong to their town (East Walpole is in Walpole).");
      if (!s.organization.inArea) problems.push(`Confirm the new company performs in ${SERVICE_AREA}.`);
      organization = {
        new: {
          name: clean(s.organization.query),
          ...(orgTown && { town: orgTown }),
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
      const locTown = maTown(s.location.town);
      if (!locTown) problems.push("The location’s city or town isn’t a Massachusetts city or town. Check the spelling; villages belong to their town (East Walpole is in Walpole).");
      location = {
        new: {
          name: clean(s.location.query),
          ...(clean(s.location.address) && { street_address: clean(s.location.address) }),
          ...(locTown && { town: locTown }),
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
  // Someone new with two roles is confirmed 18+ once, on their first row
  const confirmedNew = new Set(
    s.credits.filter((c) => c.choice.kind === "new" && c.adultConfirmed).map((c) => clean(c.person).toLowerCase()),
  );
  const countedNew = new Set<string>();

  // Cast rows without a person are roles not cast yet
  const roles: string[] = [];
  for (const c of s.credits) {
    if (c.kind !== "cast" || clean(c.person) || c.young) continue;
    for (const role of splitRoles(readUnderstudy(c.role).text)) {
      if (!roles.some((r) => r.toLowerCase() === role.toLowerCase())) roles.push(role);
    }
  }

  for (const c of s.credits) {
    // Young performers: the role only, never a person
    if (c.young && c.kind === "cast") {
      if (!clean(c.role)) missingRole++;
      const read = readUnderstudy(c.role);
      for (const role of splitRoles(read.text)) {
        credits.push({ kind: "cast", role, person_key: "", young: true, ...((!!c.understudy || read.understudy) && { understudy: true }) });
      }
      continue;
    }
    if (!clean(c.person)) continue;
    if (!clean(c.role)) missingRole++;

    let mapKey: string | null = null;
    if (c.choice.kind === "existing") {
      mapKey = `id:${c.choice.match.id}`;
      if (!keyFor.has(mapKey)) {
        keyFor.set(mapKey, `p${keyFor.size + 1}`);
        people.push({ key: keyFor.get(mapKey)!, id: c.choice.match.id, label: c.choice.match.label });
      }
    } else if (c.choice.kind === "new" && clean(c.person)) {
      const name = clean(c.person).toLowerCase();
      if (!confirmedNew.has(name) && !countedNew.has(name)) unconfirmed++;
      countedNew.add(name);
      mapKey = `new:${name}`;
      if (!keyFor.has(mapKey)) {
        keyFor.set(mapKey, `p${keyFor.size + 1}`);
        people.push({
          key: keyFor.get(mapKey)!,
          new: { display_name: clean(c.person), adult_confirmed: true, ...(c.distinct && { distinct: true }) },
        });
      }
    } else {
      unresolved++;
    }

    if (mapKey && clean(c.role)) {
      // "Mrs. Jefferson, Bohemian" is two roles; "Understudy - Joanne" covers Joanne
      const read = readUnderstudy(c.role);
      const understudy = c.kind === "cast" && (!!c.understudy || read.understudy);
      for (const role of splitRoles(read.text)) {
        const person_key = keyFor.get(mapKey)!;
        const dupe = credits.some(
          (x) => x.person_key === person_key && x.kind === c.kind && !!x.understudy === understudy && x.role.toLowerCase() === role.toLowerCase(),
        );
        if (!dupe) credits.push({ kind: c.kind, role, person_key, ...(understudy && { understudy: true }) });
      }
    }
  }
  if (missingRole) problems.push(`${missingRole} cast or crew ${missingRole === 1 ? "row needs" : "rows need"} a role.`);
  if (unresolved) problems.push(`${unresolved} ${unresolved === 1 ? "person needs" : "people need"} checking: pick an existing person or add them as new.`);
  if (unconfirmed) problems.push(`Confirm that every new person is 18 or older (${unconfirmed} to go).`);

  // Poster (optional)
  let poster: BundlePoster | null = null;
  if (s.poster) {
    if (!s.poster.rightsConfirmed) problems.push("Confirm you have permission to share the poster.");
    const { storage_key, thumb_key, width, height, bytes, palette } = s.poster;
    poster = { storage_key, thumb_key, width, height, bytes, palette };
  }

  if (existing && !poster && !location && !performances.length && !credits.length && !roles.length && !problems.length) {
    problems.push("Add at least one cast or crew member, performance, the location or a poster.");
  }

  if (problems.length) return { problems, bundle: null };
  // Optional extras shared by both bundle kinds
  const extras = {
    ...(s.resubmissionOf && { resubmission_of: s.resubmissionOf }),
    ...(poster && { poster }),
    ...(roles.length && { roles }),
  };

  if (existing) {
    return {
      problems,
      bundle: {
        version: 1,
        ...extras,
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
      ...extras,
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

  const rows = s.credits.filter((c) => clean(c.person));
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
  const young = s.credits.filter((c) => c.young && c.kind === "cast" && clean(c.role)).length;
  if (young) peopleParts.push(`${young} young ${young === 1 ? "performer" : "performers"}`);

  const live = s.existingProduction;
  return {
    show: live ? "Existing" : status(s.show.choice, !!clean(s.show.query)),
    production: live ? "Existing" : "New",
    company: live ? "Existing" : status(s.organization.choice, !!clean(s.organization.query)),
    location: live?.hasLocation ? "Existing" : status(s.location.choice, !!clean(s.location.query)),
    poster: s.poster ? "Added" : "—",
    people: peopleParts.length ? peopleParts.join(" · ") : "—",
    credits: rows.length + young,
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
  if (b.credits.some((c) => !c.young && !keys.has(c.person_key))) problems.push("A cast or crew line is missing its person.");
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
  items: {
    poster?: BundlePoster | null;
    location: Ref<NewLocation> | null;
    performances: BundlePerformance[];
    people: BundlePerson[];
    credits: BundleCredit[];
    roles?: string[];
  },
): FormState {
  if (items.poster) form.poster = { ...items.poster, rightsConfirmed: true };
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
    const row = { ...emptyCredit(c.kind), role: c.role, ...(c.understudy && { understudy: true }), ...(c.young && { young: true }) };
    if (!person) return row;
    return "new" in person
      ? { ...row, person: person.new.display_name, choice: { kind: "new" as const }, adultConfirmed: true, ...(person.new.distinct && { distinct: true }) }
      : { ...row, person: person.label, choice: { kind: "existing" as const, match: matchFrom(person) } };
  });
  // Roles not cast yet come back as cast rows without a person
  form.credits.push(...(items.roles ?? []).map((role) => ({ ...emptyCredit("cast"), role })));
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
