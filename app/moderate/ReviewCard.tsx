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
  type ShowType,
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

function Tag({ isNew }: { isNew: boolean }) {
  return isNew ? (
    <span className="tag">New</span>
  ) : (
    <span className="flex-none rounded border border-rule px-2 py-0.5 text-[13px] font-bold text-muted">In database</span>
  );
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
}: {
  id: string;
  submitted: Bundle;
  submittedBy: string;
  submittedAt: string;
  medal?: React.ReactNode; // the contributor's small medal
  knownPositions: string[]; // the crew positions list
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
  const [credits, setCredits] = useState<Item<BundleCredit>[]>(submitted.credits.map((value) => ({ include: true, value })));
  const [note, setNote] = useState("");
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
    const peopleFor = (cs: BundleCredit[]) => people.filter((p) => cs.some((c) => c.person_key === p.key));
    const items = {
      version: 1 as const,
      ...(poster?.include && { poster: poster.value }),
      location: location?.include ? location.value : null,
      performances: performances.filter((p) => p.include).map((p) => p.value),
      people: peopleFor(keep),
      credits: keep,
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
    <article className="flex flex-col gap-6 border-t-2 border-ink pt-5">
      <div className="flex flex-col gap-1">
        {addTo && <span className="tag self-start">Additions to a live production</span>}
        <h2 className="m-0 text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em]">{title}</h2>
        <span className="text-sm text-muted">
          Submitted by {submittedBy} {medal} on {submittedAt}. Correct anything that’s wrong, untick anything you can’t approve.
        </span>
      </div>

      {/* Core: always approved with the submission, but editable */}
      {!addTo && show && org && (
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
      {poster && (
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
      {location && (
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
      {performances.length > 0 && (
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
      {credits.length > 0 && (
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
                <span className="w-11 flex-none text-sm text-muted">{c.value.kind === "cast" ? "Cast" : "Crew"}</span>
                <input
                  className={`${inputBase} flex-[1_1_140px] font-semibold`}
                  aria-label="Role"
                  value={c.value.role}
                  onChange={(e) => setCredits((cs) => cs.map((x, j) => (j === i ? { ...x, value: { ...x.value, role: e.target.value } } : x)))}
                />
                {p && "new" in p ? (
                  <input
                    className={`${inputBase} flex-[1_1_160px]`}
                    aria-label="Person"
                    value={p.new.display_name}
                    onChange={(e) => setPersonName(p.key, e.target.value)}
                  />
                ) : (
                  <span className="flex-[1_1_160px] px-2.5">{p ? p.label : "?"}</span>
                )}
                <Tag isNew={!!p && "new" in p} />
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

      <NewPositions positions={newPositions} selected={addPositions} onChange={setAddPositions} />

      {problems.length > 0 && (
        <div role="alert" className="callout text-[15px]">
          <strong>Can’t approve yet:</strong>
          <ul className="m-0 mt-1 pl-5">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <Field label="Note to the contributor (optional)">
          <input
            className="field h-12 rounded-[10px] px-3.5 font-normal"
            value={note}
            placeholder={leftOutCount ? "e.g. Javert needs a source: please add a cast-list link" : ""}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <p className="m-0 text-sm text-muted">
          {leftOutCount
            ? `Leaving out ${leftOutCount} ${leftOutCount === 1 ? "item" : "items"}. ${submittedBy.split(" (")[0]} can fix and resubmit ${leftOutCount === 1 ? "it" : "them"} from their submissions page.`
            : "Everything is included."}{" "}
          Rejecting sends the whole submission back to them to fix.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={pillAccent} disabled={pending} onClick={approve}>
            {pending ? "Working…" : leftOutCount ? "Approve selected" : "Approve"}
          </button>
          <button type="button" className={pillLight} disabled={pending} onClick={reject}>
            Reject all
          </button>
        </div>
      </div>
    </article>
  );
}
