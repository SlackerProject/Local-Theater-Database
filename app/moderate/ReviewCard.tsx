"use client";

import { useState, useTransition } from "react";
import {
  SHOW_TYPES,
  isAddTo,
  type Bundle,
  type BundleCredit,
  type BundlePerformance,
  type BundlePerson,
  type BundlePoster,
  type LeftOut,
  type NewLocation,
  type Ref,
  type SameNameMatch,
  type ShowType,
  personNameKey,
} from "@/lib/submission";
import { mediaUrl } from "@/lib/media";
import { PaletteSwatches } from "@/components/uploads/UploadPanels";
import { addCrewPositions, approveSubmission, rejectSubmission } from "./actions";
import { unlistedPositions } from "@/lib/positions";
import { NewPositions } from "./NewPositions";

type Item<T> = { include: boolean; value: T };

const LOCATION_FIELDS = [
  ["name", "Name"],
  ["street_address", "Street address"],
  ["town", "City or town"],
] as const;

// inputBase has no width, so rows can size each box; input fills its cell
const inputBase = "field box-border h-12 min-w-0 px-3";
const input = `${inputBase} w-full`;
const pillAccent = "btn-primary";
const pillLight = "btn-secondary";
const small = "min-h-10 px-4 text-sm";

function Tag({ isNew }: { isNew: boolean }) {
  return isNew ? (
    <span className="tag">New</span>
  ) : (
    <span className="flex-none rounded border border-rule px-2 py-0.5 text-[13px] font-bold text-muted">In database</span>
  );
}

// "Fri, Oct 3 7:30 PM", short enough to list a whole run on one line
function perfShort(p: BundlePerformance) {
  const day = p.date
    ? new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    : "?";
  const t = p.time ? new Date(`2000-01-01T${p.time}:00Z`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }) : "";
  return `${day}${t ? ` ${t}` : ""}${p.label ? ` (${p.label})` : ""}`;
}

const dateText = (d: string) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

function NewTag() {
  return <span className="ml-1 rounded bg-ink px-1 py-px align-[1px] text-[11px] font-bold uppercase tracking-wide text-white">New</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[15px] font-semibold">
      {label}
      {children}
    </label>
  );
}

function Include({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex h-12 w-11 flex-none cursor-pointer items-center justify-center" title={checked ? "Included" : "Left out"}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="h-5 w-5 accent-ink"
      />
    </label>
  );
}

export function ReviewCard({
  id,
  submitted,
  submittedBy,
  submittedAt,
  medal,
  knownPositions,
  sameName = {},
}: {
  id: string;
  submitted: Bundle;
  submittedBy: string;
  submittedAt: string;
  medal?: React.ReactNode; // the contributor's small medal
  knownPositions: string[]; // the crew positions list
  sameName?: Record<string, SameNameMatch[]>; // people already on the site, by name key
}) {
  const addTo = isAddTo(submitted);
  const [show, setShow] = useState(addTo ? null : submitted.show);
  const [org, setOrg] = useState(addTo ? null : submitted.organization);
  const [year, setYear] = useState(addTo ? "" : String(submitted.production.year));
  const [opening, setOpening] = useState(addTo ? "" : (submitted.production.opening_date ?? ""));
  const [closing, setClosing] = useState(addTo ? "" : (submitted.production.closing_date ?? ""));
  const [poster, setPoster] = useState<Item<BundlePoster> | null>(
    submitted.poster ? { include: true, value: submitted.poster } : null,
  );
  const [location, setLocation] = useState<Item<Ref<NewLocation>> | null>(
    submitted.location ? { include: true, value: submitted.location } : null,
  );
  const [performances, setPerformances] = useState<Item<BundlePerformance>[]>(
    submitted.performances.map((value) => ({ include: true, value })),
  );
  const [people, setPeople] = useState<BundlePerson[]>(submitted.people);
  // New people who are already on the site: the existing person's id
  // ("same person", the default) or "distinct" (a different person)
  const matchesFor = (p: BundlePerson) => ("new" in p ? (sameName[personNameKey(p.new.display_name)] ?? []) : []);
  const [sameAs, setSameAs] = useState<Record<string, string>>(() =>
    Object.fromEntries(submitted.people.flatMap((p) => (matchesFor(p).length ? [[p.key, matchesFor(p)[0].id]] : []))),
  );
  const [credits, setCredits] = useState<Item<BundleCredit>[]>(submitted.credits.map((value) => ({ include: true, value })));
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  // The short read-only summary first; the full editor only when needed
  const [editing, setEditing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [addPositions, setAddPositions] = useState<Set<string>>(new Set());
  const newPositions = unlistedPositions(
    credits.filter((c) => c.include && c.value.kind === "crew").map((c) => c.value.role),
    knownPositions,
  );

  const newLocation = location && "new" in location.value ? location.value.new : null;
  const showTitle = show ? ("new" in show ? show.new.title : show.label) : "";
  const title = addTo ? submitted.production.display_title : `${showTitle} (${year})`;
  const person = (key: string) => people.find((p) => p.key === key);
  const setPersonName = (key: string, name: string) =>
    setPeople((ps) => ps.map((p) => (p.key === key && "new" in p ? { ...p, new: { ...p.new, display_name: name } } : p)));

  const leftOutCount =
    (poster && !poster.include ? 1 : 0) +
    (location && !location.include ? 1 : 0) +
    performances.filter((p) => !p.include).length +
    credits.filter((c) => !c.include).length;

  function build(): { bundle: Bundle; leftOut: LeftOut } {
    const keep = credits.filter((c) => c.include).map((c) => c.value);
    const drop = credits.filter((c) => !c.include).map((c) => c.value);
    // "Same person" links to the existing page; "different" lets a new one share the name
    const resolved: BundlePerson[] = people.map((p) => {
      const choice = sameAs[p.key];
      if (!("new" in p) || !choice) return p;
      if (choice === "distinct") return { ...p, new: { ...p.new, distinct: true } };
      const m = matchesFor(p).find((x) => x.id === choice);
      return m ? { key: p.key, id: m.id, label: m.label } : p;
    });
    const peopleFor = (cs: BundleCredit[]) => resolved.filter((p) => cs.some((c) => c.person_key === p.key));
    const items = {
      version: 1 as const,
      ...(poster?.include && { poster: poster.value }),
      location: location?.include ? location.value : null,
      performances: performances.filter((p) => p.include).map((p) => p.value),
      people: peopleFor(keep),
      credits: keep,
      ...(submitted.roles?.length && { roles: submitted.roles }),
    };
    const bundle: Bundle = addTo
      ? { ...items, production: submitted.production }
      : {
          ...items,
          show: show!,
          organization: org!,
          production: {
            year: Number(year),
            opening_date: opening || null,
            closing_date: closing || null,
            display_title: title,
          },
        };
    const leftOut: LeftOut = {
      poster: poster && !poster.include ? poster.value : null,
      location: location && !location.include ? location.value : null,
      performances: performances.filter((p) => !p.include).map((p) => p.value),
      people: peopleFor(drop),
      credits: drop,
    };
    return { bundle, leftOut };
  }

  function approve() {
    const { bundle, leftOut } = build();
    startTransition(async () => {
      // Ticked "Other…" positions join the list first
      const add = newPositions.filter((p) => addPositions.has(p));
      if (add.length) {
        const r = await addCrewPositions(add);
        if (!r.ok) return setProblems([r.error ?? "Couldn’t add the new positions."]);
      }
      const result = await approveSubmission(id, bundle, leftOut, note);
      if (result && !result.ok) setProblems(result.problems);
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectSubmission(id, note);
      if (result && !result.ok) setProblems(result.problems);
    });
  }

  return (
    <article className={`flex flex-col border-t border-rule py-4 ${editing ? "gap-6" : "gap-3"}`}>
      <div className="flex flex-col gap-0.5">
        <h3 className="m-0 text-xl font-extrabold leading-tight tracking-[-0.01em]">
          {title}
          {addTo && <span className="tag ml-2 align-middle text-[12px]">Additions to a live production</span>}
        </h3>
        <span className="text-sm text-muted">
          By {submittedBy} {medal} · {submittedAt}
          {editing && ". Correct anything that’s wrong, untick anything you can’t approve."}
        </span>
      </div>

      {!editing && (
        <Summary
          addTo={addTo}
          show={show}
          org={org}
          year={year}
          opening={opening}
          closing={closing}
          poster={poster}
          location={location}
          performances={performances}
          credits={credits}
          person={person}
          isNew={(p) => !!p && "new" in p && !(sameAs[p.key] && sameAs[p.key] !== "distinct")}
          roles={submitted.roles ?? []}
        />
      )}

      {/* Core: always approved with the submission, but editable */}
      {editing && !addTo && show && org && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted">Show <Tag isNew={"new" in show} /></div>
            {"new" in show ? (
              <>
                <Field label="Title">
                  <input className={input} value={show.new.title} onChange={(e) => setShow({ new: { ...show.new, title: e.target.value } })} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Type">
                    <select className={input} value={show.new.type} onChange={(e) => setShow({ new: { ...show.new, type: e.target.value as ShowType } })}>
                      {SHOW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Subtitle">
                    <input className={input} value={show.new.subtitle ?? ""} onChange={(e) => setShow({ new: { ...show.new, subtitle: e.target.value } })} />
                  </Field>
                </div>
                <Field label="Authors">
                  <input className={input} value={show.new.authors ?? ""} onChange={(e) => setShow({ new: { ...show.new, authors: e.target.value } })} />
                </Field>
              </>
            ) : (
              <span>{show.label}</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted">Company <Tag isNew={"new" in org} /></div>
            {"new" in org ? (
              <>
                <Field label="Name">
                  <input className={input} value={org.new.name} onChange={(e) => setOrg({ new: { ...org.new, name: e.target.value } })} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Town">
                    <input className={input} value={org.new.town ?? ""} onChange={(e) => setOrg({ new: { ...org.new, town: e.target.value } })} />
                  </Field>
                  <Field label="Website">
                    <input className={input} value={org.new.website_url ?? ""} onChange={(e) => setOrg({ new: { ...org.new, website_url: e.target.value } })} />
                  </Field>
                </div>
              </>
            ) : (
              <span>{org.label}</span>
            )}
          </div>

          <div className="col-span-full flex flex-col gap-2">
            <div className="text-sm font-semibold text-muted">When</div>
            <div className="grid max-w-[560px] grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
              <Field label="Year">
                <input className={input} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="Opening">
                <input className={input} type="date" value={opening} onChange={(e) => setOpening(e.target.value)} />
              </Field>
              <Field label="Closing">
                <input className={input} type="date" value={closing} onChange={(e) => setClosing(e.target.value)} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* Poster: optional, can be left out */}
      {editing && poster && (
        <section className="flex flex-col gap-2">
          <h3 className="subheading">Poster</h3>
          <div className={`flex flex-wrap items-end gap-3 ${poster.include ? "" : "opacity-55"}`}>
            <Include checked={poster.include} onChange={(include) => setPoster({ ...poster, include })} label="Include the poster" />
            <a href={mediaUrl(poster.value.storage_key)!} target="_blank" rel="noopener noreferrer" className="block w-[120px]">
              <div className="flex aspect-[4/5] w-full items-center overflow-hidden rounded-[4px]" style={{ background: poster.value.palette.ground }}>
                <img src={mediaUrl(poster.value.thumb_key)!} alt="Submitted poster" className="h-full w-full object-contain" />
              </div>
            </a>
            <PaletteSwatches palette={poster.value.palette} />
          </div>
        </section>
      )}

      {/* Location: optional, can be left out */}
      {editing && location && (
        <section className="flex flex-col gap-2">
          <h3 className="subheading">Location</h3>
          <div className={`flex items-start gap-2 ${location.include ? "" : "opacity-55"}`}>
            <Include checked={location.include} onChange={(include) => setLocation({ ...location, include })} label="Include the location" />
            {newLocation ? (
              <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
                {LOCATION_FIELDS.map(([k, label]) => (
                  <Field key={k} label={label}>
                    <input
                      className={input}
                      value={newLocation[k] ?? ""}
                      onChange={(e) => setLocation({ ...location, value: { new: { ...newLocation, [k]: e.target.value } } })}
                    />
                  </Field>
                ))}
              </div>
            ) : "label" in location.value && (
              <span className="flex h-12 items-center gap-2">{location.value.label} <Tag isNew={false} /></span>
            )}
          </div>
        </section>
      )}

      {/* Performances */}
      {editing && performances.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="subheading">Performances ({performances.filter((p) => p.include).length} of {performances.length})</h3>
          {performances.map((p, i) => {
            const set = (patch: Partial<BundlePerformance>) =>
              setPerformances((ps) => ps.map((x, j) => (j === i ? { ...x, value: { ...x.value, ...patch } } : x)));
            return (
              <div key={i} className={`flex flex-wrap items-center gap-2 border-b border-rule py-1.5 ${p.include ? "" : "opacity-55"}`}>
                <Include
                  checked={p.include}
                  onChange={(include) => setPerformances((ps) => ps.map((x, j) => (j === i ? { ...x, include } : x)))}
                  label={`Include the performance on ${p.value.date}`}
                />
                <input className={`${inputBase} w-[160px] flex-none`} type="date" aria-label="Date" value={p.value.date} onChange={(e) => set({ date: e.target.value })} />
                <input className={`${inputBase} w-[140px] flex-none`} type="time" aria-label="Time" value={p.value.time} onChange={(e) => set({ time: e.target.value })} />
                <input className={`${inputBase} flex-[1_1_120px]`} aria-label="Label" placeholder="Label" value={p.value.label ?? ""} onChange={(e) => set({ label: e.target.value })} />
              </div>
            );
          })}
        </section>
      )}

      {/* Cast and crew */}
      {editing && credits.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="subheading">Cast and crew ({credits.filter((c) => c.include).length} of {credits.length})</h3>
          {credits.map((c, i) => {
            const p = person(c.value.person_key);
            return (
              <div key={i} className={`flex flex-wrap items-center gap-2 border-b border-rule py-1.5 ${c.include ? "" : "opacity-55"}`}>
                <Include
                  checked={c.include}
                  onChange={(include) => setCredits((cs) => cs.map((x, j) => (j === i ? { ...x, include } : x)))}
                  label={`Include ${c.value.role}`}
                />
                <span className="w-11 flex-none text-sm text-muted">{c.value.kind === "cast" ? (c.value.understudy ? "U/S" : "Cast") : "Crew"}</span>
                <input
                  className={`${inputBase} flex-[1_1_140px] font-semibold`}
                  aria-label="Role"
                  value={c.value.role}
                  onChange={(e) => setCredits((cs) => cs.map((x, j) => (j === i ? { ...x, value: { ...x.value, role: e.target.value } } : x)))}
                />
                {c.value.young ? (
                  <span className="flex-[1_1_160px] px-2.5 text-muted">Young performer (under 18, no name)</span>
                ) : p && "new" in p ? (
                  <input
                    className={`${inputBase} flex-[1_1_160px]`}
                    aria-label="Person"
                    value={p.new.display_name}
                    onChange={(e) => setPersonName(p.key, e.target.value)}
                  />
                ) : (
                  <span className="flex-[1_1_160px] px-2.5">{p ? p.label : "?"}</span>
                )}
                {!c.value.young && <Tag isNew={!!p && "new" in p && !(sameAs[p.key] && sameAs[p.key] !== "distinct")} />}
              </div>
            );
          })}
          {people.some((p) => "new" in p) && (
            <p className="m-0 pt-1 text-sm text-muted">
              Fixing a new person’s name fixes it on every line they appear on. The contributor confirmed each new person is 18 or older.
            </p>
          )}
        </section>
      )}

      {people
            .filter((p) => matchesFor(p).length > 0 && credits.some((c) => c.include && c.value.person_key === p.key))
            .map((p) => (
              <fieldset key={p.key} className="callout m-0 flex flex-col gap-1.5 border-0 text-[15px]">
                <legend className="float-left mb-1 w-full font-bold">
                  {"new" in p ? p.new.display_name : ""} is already on the site. Is this the same person?
                </legend>
                {matchesFor(p).map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="radio"
                      name={`same-${id}-${p.key}`}
                      checked={sameAs[p.key] === m.id}
                      onChange={() => setSameAs((s) => ({ ...s, [p.key]: m.id }))}
                      className="mt-1 h-4 w-4 flex-none accent-ink"
                    />
                    <span>
                      <strong>Same person:</strong>{" "}
                      <a href={`/person/${m.slug}`} target="_blank" rel="noopener noreferrer">
                        {m.label}
                      </a>
                      {m.detail && <span className="text-muted"> ({m.detail})</span>}
                    </span>
                  </label>
                ))}
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="radio"
                    name={`same-${id}-${p.key}`}
                    checked={sameAs[p.key] === "distinct"}
                    onChange={() => setSameAs((s) => ({ ...s, [p.key]: "distinct" }))}
                    className="mt-1 h-4 w-4 flex-none accent-ink"
                  />
                  <span>
                    <strong>A different person</strong> with the same name (gets their own page)
                  </span>
                </label>
              </fieldset>
            ))}

      {editing && !!submitted.roles?.length && (
        <section className="flex flex-col gap-1">
          <h3 className="subheading">Roles not cast yet ({submitted.roles.length})</h3>
          <p className="m-0 text-[15px]">{submitted.roles.join(", ")}</p>
          <span className="text-sm text-muted">Added to the show’s role list (roles it already has are skipped).</span>
        </section>
      )}

      <NewPositions positions={newPositions} selected={addPositions} onChange={setAddPositions} />

      {problems.length > 0 && (
        <div role="alert" className="callout text-[15px]">
          <strong>Can’t approve yet:</strong>
          <ul className="m-0 mt-1 pl-5">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {(noting || editing) && (
          <Field label="Note to the contributor (optional)">
            <input
              className="field h-10 rounded-[8px] px-3 font-normal"
              value={note}
              autoFocus={noting && !editing}
              placeholder={leftOutCount ? "e.g. Javert needs a source: please add a cast-list link" : ""}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        )}
        {(editing || leftOutCount > 0) && (
          <p className="m-0 text-sm text-muted">
            {leftOutCount
              ? `Leaving out ${leftOutCount} ${leftOutCount === 1 ? "item" : "items"}. ${submittedBy.split(" (")[0]} can fix and resubmit ${leftOutCount === 1 ? "it" : "them"} from their submissions page.`
              : "Everything is included."}{" "}
            Rejecting sends the whole submission back to them to fix.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${pillAccent} ${small}`} disabled={pending} onClick={approve}>
            {pending ? "Working…" : leftOutCount ? "Approve selected" : "Approve"}
          </button>
          <button type="button" className={`${pillLight} ${small}`} disabled={pending} onClick={() => setEditing((e) => !e)}>
            {editing ? "Done editing" : "Edit or leave things out"}
          </button>
          <button type="button" className={`${pillLight} ${small}`} disabled={pending} onClick={reject}>
            Reject all
          </button>
          {!noting && !editing && (
            <button type="button" className="btn-text text-[15px]" onClick={() => setNoting(true)}>
              Add a note
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// The submission at a glance: the facts as label/value lines and the cast
// and crew in columns. Anything left out in the editor is struck through.
function Summary({
  addTo,
  show,
  org,
  year,
  opening,
  closing,
  poster,
  location,
  performances,
  credits,
  person,
  isNew,
  roles,
}: {
  addTo: boolean;
  show: Extract<Bundle, { show: unknown }>["show"] | null;
  org: Extract<Bundle, { organization: unknown }>["organization"] | null;
  year: string;
  opening: string;
  closing: string;
  poster: Item<BundlePoster> | null;
  location: Item<Ref<NewLocation>> | null;
  performances: Item<BundlePerformance>[];
  credits: Item<BundleCredit>[];
  person: (key: string) => BundlePerson | undefined;
  isNew: (p: BundlePerson | undefined) => boolean;
  roles: string[];
}) {
  const out = (include: boolean) => (include ? "" : "text-muted line-through");
  const dt = "font-semibold text-muted";
  const castCount = credits.filter((c) => c.value.kind === "cast").length;
  const lines = (kind: "cast" | "crew") =>
    credits.map((c, i) => ({ c, i })).filter(({ c }) => c.value.kind === kind);

  return (
    <div className="flex flex-col gap-3 text-[15px]">
      <div className="flex gap-4">
        {poster && (
          <a href={mediaUrl(poster.value.storage_key)!} target="_blank" rel="noopener noreferrer" className={`block w-[64px] flex-none ${poster.include ? "" : "opacity-40"}`} title="Poster (opens full size)">
            <div className="flex aspect-[4/5] w-full items-center overflow-hidden rounded-[3px]" style={{ background: poster.value.palette.ground }}>
              <img src={mediaUrl(poster.value.thumb_key)!} alt="Submitted poster" className="h-full w-full object-contain" />
            </div>
          </a>
        )}
        <dl className="m-0 grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
          {!addTo && show && (
            <>
              <dt className={dt}>Show</dt>
              <dd className="m-0">
                {"new" in show ? (
                  <>
                    {show.new.title}
                    <NewTag />
                    <span className="text-muted">
                      {" "}
                      · {SHOW_TYPES.find((t) => t.value === show.new.type)?.label}
                      {show.new.authors && ` · ${show.new.authors}`}
                    </span>
                  </>
                ) : (
                  show.label
                )}
              </dd>
            </>
          )}
          {!addTo && org && (
            <>
              <dt className={dt}>Company</dt>
              <dd className="m-0">
                {"new" in org ? (
                  <>
                    {org.new.name}
                    <NewTag />
                    {(org.new.town || org.new.website_url) && (
                      <span className="text-muted"> · {[org.new.town, org.new.website_url].filter(Boolean).join(" · ")}</span>
                    )}
                  </>
                ) : (
                  org.label
                )}
              </dd>
            </>
          )}
          {!addTo && (
            <>
              <dt className={dt}>Dates</dt>
              <dd className="m-0">{opening || closing ? [dateText(opening), dateText(closing)].filter(Boolean).join(" – ") : year}</dd>
            </>
          )}
          {location && (
            <>
              <dt className={dt}>Venue</dt>
              <dd className={`m-0 ${out(location.include)}`}>
                {"new" in location.value ? (
                  <>
                    {[location.value.new.name, location.value.new.street_address, location.value.new.town].filter(Boolean).join(", ")}
                    <NewTag />
                  </>
                ) : (
                  location.value.label
                )}
              </dd>
            </>
          )}
          {performances.length > 0 && (
            <>
              <dt className={dt}>Shows</dt>
              <dd className="m-0">
                {performances.map((p, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    <span className={out(p.include)}>{perfShort(p.value)}</span>
                  </span>
                ))}
              </dd>
            </>
          )}
          {roles.length > 0 && (
            <>
              <dt className={dt}>Roles not cast</dt>
              <dd className="m-0">{roles.join(", ")}</dd>
            </>
          )}
        </dl>
      </div>

      {(["cast", "crew"] as const).map((kind) => {
        const rows = lines(kind);
        if (!rows.length) return null;
        return (
          <div key={kind} className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-muted">
              {kind === "cast" ? `Cast (${castCount})` : `Creative team (${rows.length})`}
            </span>
            <ul className="m-0 list-none columns-1 gap-6 p-0 text-sm sm:columns-2 lg:columns-3">
              {rows.map(({ c, i }) => {
                const p = person(c.value.person_key);
                return (
                  <li key={i} className={`break-inside-avoid py-px ${out(c.include)}`}>
                    <span className="text-muted">{c.value.understudy ? `U/S ${c.value.role}` : c.value.role}:</span>{" "}
                    {c.value.young ? (
                      <span className="text-muted">Young performer</span>
                    ) : (
                      <>
                        {p ? ("new" in p ? p.new.display_name : p.label) : "?"}
                        {isNew(p) && <NewTag />}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
