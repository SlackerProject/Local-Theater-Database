"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import {
  SHOW_TYPES,
  buildBundle,
  displayTitle,
  emptyCredit,
  emptyFormState,
  isBlankCredit,
  newId,
  summarize,
  type Choice,
  type CreditRow,
  type FormState,
  type Match,
  type Performance,
  type ShowType,
} from "@/lib/submission";
import { discardDraft, saveDraft, submitProduction } from "./actions";
import { NewPill, PickedLine, TypeAhead, lookup } from "./TypeAhead";
import { PosterField } from "@/components/uploads/UploadPanels";

// ---------------------------------------------------------------------
// Small presentational pieces shared by the sections
// ---------------------------------------------------------------------
// Section groups: a heading and a rule, not a bordered box (design v2)
const card = "flex flex-col gap-4 border-t border-rule pt-7";
const smallField = "field box-border h-12 w-full min-w-0 px-3";
const largeField = "field box-border h-12 w-full min-w-0 px-3.5";
const linkButton = "btn-text";
const pillDark = "btn-primary";
const pillLight = "btn-secondary";

// "Not in the database yet" panel. With onDone it gets a Done button
// that folds it into a NewSummary line; doneHint explains why Done is disabled.
function NewPanel({
  badge,
  note,
  children,
  onDone,
  doneHint,
}: {
  badge: string;
  note: string;
  children?: React.ReactNode;
  onDone?: () => void;
  doneHint?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-l-[3px] border-rule py-1 pl-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <NewPill>{badge}</NewPill>
        <span className="text-sm text-muted">{note}</span>
      </div>
      {children}
      {onDone && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={pillLight}
            disabled={!!doneHint}
            onClick={onDone}
          >
            Done
          </button>
          {doneHint && <span className="text-sm text-muted">{doneHint}</span>}
        </div>
      )}
    </div>
  );
}

// A folded NewPanel: "NEW SHOW  Play · The Broadway Musical  Edit details"
function NewSummary({ badge, details, onEdit }: { badge: string; details: string; onEdit: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 text-sm text-muted">
      <NewPill>{badge}</NewPill>
      {details}
      <button type="button" className={linkButton} onClick={onEdit}>
        Edit details
      </button>
    </div>
  );
}

function SmallInput({
  label,
  optional,
  value,
  onChange,
  type = "text",
  placeholder,
  list,
}: {
  label: string;
  optional?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  list?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        list={list}
        onChange={(e) => onChange(e.target.value)}
        className={smallField}
      />
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Formatted by hand so server and browser render identical text
function formatPerformance(p: Performance) {
  const [y, m, d] = p.date.split("-").map(Number);
  const [hh, mm] = p.time.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh)) return "Date and time to come";
  const weekday = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${weekday}, ${MONTHS[m - 1]} ${d}, ${y} · ${hour12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const byDateTime = (a: Performance, b: Performance) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);

// "Role: Name", "Role - Name", "Role, Name" or "Role<tab>Name", one per line
function parseCastList(text: string): { role: string; person: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s*(?::|\t|\s[-–—]\s|,)\s*(.+)$/);
      return m ? { role: m[1].trim(), person: m[2].trim() } : { role: "", person: line };
    });
}

// ---------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------
export function AddProductionForm({ initial, defaultYear }: { initial: FormState | null; defaultYear: string }) {
  const [state, setState] = useState<FormState>(initial ?? emptyFormState(defaultYear));
  const [tab, setTab] = useState<"cast" | "crew">("cast");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(
    initial?.resubmissionOf
      ? "Here’s what needs fixing. Make your changes, then submit for review again."
      : initial
        ? "Picked up where you left off from your saved draft."
        : null,
  );
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (fn: (s: FormState) => FormState) => setState((s) => fn(s));
  const summary = summarize(state);
  const title = displayTitle(state);

  // ----- credits -----
  const setCredit = (id: string, patch: Partial<CreditRow>) =>
    update((s) => ({ ...s, credits: s.credits.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  async function checkPeople(rows: CreditRow[]) {
    for (const row of rows) {
      const matches = await lookup("people", row.person);
      setCredit(row.id, { choice: matches.length ? { kind: "suggest", match: matches[0] } : { kind: "new" } });
    }
  }

  function addPastedRows() {
    const parsed = parseCastList(pasteText);
    if (!parsed.length) return;
    const rows = parsed.map(({ role, person }) => ({ ...emptyCredit(tab), role, person }));
    update((s) => ({ ...s, credits: [...s.credits.filter((c) => !(c.kind === tab && isBlankCredit(c))), ...rows] }));
    setPasteText("");
    setPasteOpen(false);
    void checkPeople(rows.filter((r) => r.person));
  }

  // ----- performances -----
  const setPerformance = (id: string, patch: Partial<Performance>) =>
    update((s) => ({ ...s, performances: s.performances.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  function addPerformance() {
    update((s) => {
      const last = [...s.performances].sort(byDateTime).at(-1);
      const date = last?.date ? addDays(last.date, 1) : s.openingDate || "";
      return {
        ...s,
        performances: [...s.performances, { id: newId(), date, time: last?.time ?? "19:30", label: "", editing: true }],
      };
    });
  }

  function repeatWeekly() {
    const done = state.performances.filter((p) => p.date && p.time).sort(byDateTime);
    if (!done.length) {
      setNotice("Add the first week’s performances, then use Repeat weekly.");
      return;
    }
    const firstWeekEnd = addDays(done[0].date, 6);
    const lastDate = done.at(-1)!.date;
    const week = done.filter((p) => p.date <= firstWeekEnd);
    const until = state.closingDate || addDays(lastDate, 7);
    const existing = new Set(done.map((p) => `${p.date} ${p.time}`));
    const added: Performance[] = [];
    for (let offset = 7; offset <= 7 * 52; offset += 7) {
      const batch = week.map((p) => ({ ...p, date: addDays(p.date, offset) })).filter((p) => p.date <= until);
      if (!batch.length) break;
      for (const p of batch) {
        if (existing.has(`${p.date} ${p.time}`)) continue;
        existing.add(`${p.date} ${p.time}`);
        added.push({ id: newId(), date: p.date, time: p.time, label: p.label === "Matinee" ? "Matinee" : "" });
      }
    }
    if (!added.length) {
      setNotice(
        state.closingDate
          ? "Every week up to the closing date is already listed."
          : "Set a closing date to repeat the schedule up to it.",
      );
      return;
    }
    setNotice(`Added ${added.length} ${added.length === 1 ? "performance" : "performances"}.`);
    update((s) => ({ ...s, performances: [...s.performances, ...added].sort(byDateTime) }));
  }

  // ----- submit / draft -----
  function onSubmit() {
    const { problems: found } = buildBundle(state);
    setProblems(found);
    if (found.length) return;
    startTransition(async () => {
      const result = await submitProduction(state);
      if (result.ok) {
        setSubmitted(true);
        window.scrollTo({ top: 0 });
      } else {
        setProblems(result.problems);
      }
    });
  }

  function onSaveDraft() {
    startTransition(async () => {
      const result = await saveDraft(state);
      if (result.ok) setNotice(`Draft saved at ${new Date(result.savedAt!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
      else setProblems(result.problems);
    });
  }

  function startOver() {
    startTransition(async () => {
      await discardDraft();
      setState(emptyFormState(defaultYear));
      setProblems([]);
      setNotice(null);
      setSubmitted(false);
    });
  }

  if (submitted) {
    return (
      <div className="callout flex max-w-[640px] flex-col gap-4" role="status">
        <h2 className="heading">Submitted</h2>
        <p className="m-0 text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em]">{title}</p>
        <p className="m-0 text-muted">
          Thanks! A moderator will review your submission. Once it’s approved, the production and everyone in it go
          live, and you earn points.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className={pillDark} onClick={startOver}>
            Add another production
          </button>
          <Link href="/" className={`${pillLight} no-underline`}>
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const visibleCredits = state.credits.filter((c) => c.kind === tab);
  // Resubmitting left-out items: they join this live production
  const live = state.existingProduction;

  return (
    <div className="flex flex-wrap items-start gap-7">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        {live && (
          <section
            className="callout flex flex-col gap-3"
            aria-labelledby="s-live"
          >
            <h2 id="s-live" className="heading">Adding to a live production</h2>
            <p className="m-0 text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em]">{live.label}</p>
            <p className="m-0 text-[15px] text-muted">
              These are the items a moderator didn’t approve last time. Fix what’s needed and submit them again;
              once approved they’re added to this production.
            </p>
          </section>
        )}

        {/* 1 · The show */}
        {!live && (
        <section className={card} aria-labelledby="s-show">
          <h2 id="s-show" className="heading">1 · The show</h2>
          <div className="flex flex-col gap-1.5">
            <TypeAhead
              kind="shows"
              noun="show"
              label="Show title"
              query={state.show.query}
              choice={state.show.choice}
              onQueryChange={(query) =>
                update((s) => ({ ...s, show: { ...s.show, query, choice: { kind: "none" }, editing: true } }))
              }
              onPick={(match) => update((s) => ({ ...s, show: { ...s.show, query: match.label, choice: { kind: "existing", match } } }))}
              onAddNew={() => update((s) => ({ ...s, show: { ...s.show, choice: { kind: "new" } } }))}
              onLeaveUnresolved={(matches) => {
                if (!matches.length) update((s) => ({ ...s, show: { ...s.show, choice: { kind: "new" } } }));
              }}
            />
            {state.show.choice.kind === "existing" && (
              <PickedLine
                match={state.show.choice.match}
                onChange={() => update((s) => ({ ...s, show: { ...s.show, choice: { kind: "none" } } }))}
              />
            )}
            {state.show.choice.kind === "new" && state.show.editing === false && (
              <NewSummary
                badge="New show"
                details={[SHOW_TYPES.find((t) => t.value === state.show.type)?.label ?? "", state.show.subtitle]
                  .filter((x) => x.trim())
                  .join(" · ")}
                onEdit={() => update((s) => ({ ...s, show: { ...s.show, editing: true } }))}
              />
            )}
            {state.show.choice.kind === "new" && state.show.editing !== false && (
              <NewPanel
                badge="New show"
                note="Not in the database yet. A few details:"
                onDone={() => update((s) => ({ ...s, show: { ...s.show, editing: false } }))}
                doneHint={state.show.type ? undefined : "Choose a type first."}
              >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <label htmlFor="f-show-type" className="text-[15px] font-semibold">Type</label>
                    <select
                      id="f-show-type"
                      value={state.show.type}
                      onChange={(e) => update((s) => ({ ...s, show: { ...s.show, type: e.target.value as ShowType } }))}
                      className={smallField}
                    >
                      <option value="">Choose…</option>
                      {SHOW_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <SmallInput
                    label="Subtitle"
                    optional
                    placeholder="e.g. The Broadway Musical"
                    value={state.show.subtitle}
                    onChange={(subtitle) => update((s) => ({ ...s, show: { ...s.show, subtitle } }))}
                  />
                </div>
                <SmallInput
                  label="Authors"
                  optional
                  placeholder="e.g. Book by Allan Knee · Music by Jason Howland"
                  value={state.show.authors ?? ""}
                  onChange={(authors) => update((s) => ({ ...s, show: { ...s.show, authors } }))}
                />
              </NewPanel>
            )}
          </div>
        </section>
        )}

        {/* 2 · Company and location */}
        {!live?.hasLocation && (
        <section className={card} aria-labelledby="s-org">
          <h2 id="s-org" className="heading">{live ? "Location" : "2 · Company and location"}</h2>
          {!live && (
          <div className="flex flex-col gap-1.5">
            <TypeAhead
              kind="organizations"
              noun="company"
              label="Theater company"
              query={state.organization.query}
              choice={state.organization.choice}
              onQueryChange={(query) =>
                update((s) => ({ ...s, organization: { ...s.organization, query, choice: { kind: "none" }, editing: true } }))
              }
              onPick={(match) =>
                update((s) => ({ ...s, organization: { ...s.organization, query: match.label, choice: { kind: "existing", match } } }))
              }
              onAddNew={() => update((s) => ({ ...s, organization: { ...s.organization, choice: { kind: "new" } } }))}
              onLeaveUnresolved={(matches) => {
                if (!matches.length) update((s) => ({ ...s, organization: { ...s.organization, choice: { kind: "new" } } }));
              }}
            />
            {state.organization.choice.kind === "existing" && (
              <PickedLine
                match={state.organization.choice.match}
                onChange={() => update((s) => ({ ...s, organization: { ...s.organization, choice: { kind: "none" } } }))}
              />
            )}
            {state.organization.choice.kind === "new" && state.organization.editing === false && (
              <NewSummary
                badge="New company"
                details={[state.organization.town, state.organization.website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")]
                  .filter((x) => x.trim())
                  .join(" · ")}
                onEdit={() => update((s) => ({ ...s, organization: { ...s.organization, editing: true } }))}
              />
            )}
            {state.organization.choice.kind === "new" && state.organization.editing !== false && (
              <NewPanel
                badge="New company"
                note="Not in the database yet. A few details:"
                onDone={() => update((s) => ({ ...s, organization: { ...s.organization, editing: false } }))}
              >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                  <SmallInput
                    label="Town"
                    value={state.organization.town}
                    onChange={(town) => update((s) => ({ ...s, organization: { ...s.organization, town } }))}
                  />
                  <SmallInput
                    label="Website"
                    optional
                    type="url"
                    placeholder="https://"
                    value={state.organization.website}
                    onChange={(website) => update((s) => ({ ...s, organization: { ...s.organization, website } }))}
                  />
                </div>
              </NewPanel>
            )}
          </div>
          )}

          <div className="flex flex-col gap-1.5">
            <TypeAhead
              kind="locations"
              noun="location"
              label="Location"
              query={state.location.query}
              choice={state.location.choice}
              onQueryChange={(query) =>
                update((s) => ({ ...s, location: { ...s.location, query, choice: { kind: "none" }, editing: true } }))
              }
              onPick={(match) =>
                update((s) => ({ ...s, location: { ...s.location, query: match.label, choice: { kind: "existing", match } } }))
              }
              onAddNew={() =>
                update((s) => ({
                  ...s,
                  location: { ...s.location, choice: { kind: "new" }, editing: true, town: s.location.town || s.organization.town },
                }))
              }
              onLeaveUnresolved={(matches) => {
                if (!matches.length)
                  update((s) => ({
                    ...s,
                    location: { ...s.location, choice: { kind: "new" }, editing: true, town: s.location.town || s.organization.town },
                  }));
              }}
            />
            {state.location.choice.kind === "existing" && (
              <PickedLine
                match={state.location.choice.match}
                onChange={() => update((s) => ({ ...s, location: { ...s.location, choice: { kind: "none" } } }))}
              />
            )}
            {state.location.choice.kind === "new" &&
              (state.location.editing ? (
                <NewPanel
                  badge="New location"
                  note="Not in the database yet. Where is it?"
                  onDone={() => update((s) => ({ ...s, location: { ...s.location, editing: false } }))}
                >
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                    <SmallInput
                      label="Street address"
                      optional
                      value={state.location.address}
                      onChange={(address) => update((s) => ({ ...s, location: { ...s.location, address } }))}
                    />
                    <SmallInput
                      label="Town"
                      value={state.location.town}
                      onChange={(town) => update((s) => ({ ...s, location: { ...s.location, town } }))}
                    />
                  </div>
                </NewPanel>
              ) : (
                <NewSummary
                  badge="New location"
                  details={[state.location.address, state.location.town, "MA"].filter((x) => x.trim()).join(", ")}
                  onEdit={() => update((s) => ({ ...s, location: { ...s.location, editing: true } }))}
                />
              ))}
          </div>
        </section>
        )}

        {/* 3 · When */}
        <section className={card} aria-labelledby="s-when">
          <h2 id="s-when" className="heading">{live ? "Performances" : "3 · When"}</h2>
          {!live && (
          <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="f-year" className="font-semibold">Year</label>
              <input
                id="f-year"
                type="text"
                inputMode="numeric"
                maxLength={4}
                required
                value={state.year}
                onChange={(e) => update((s) => ({ ...s, year: e.target.value.replace(/\D/g, "") }))}
                className={largeField}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="f-open" className="font-semibold">Opening</label>
              <input
                id="f-open"
                type="date"
                value={state.openingDate}
                onChange={(e) => update((s) => ({ ...s, openingDate: e.target.value }))}
                className={largeField}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="f-close" className="font-semibold">Closing</label>
              <input
                id="f-close"
                type="date"
                value={state.closingDate}
                min={state.openingDate || undefined}
                onChange={(e) => update((s) => ({ ...s, closingDate: e.target.value }))}
                className={largeField}
              />
            </div>
          </div>
          <p className="m-0 text-sm text-muted" aria-live="polite">
            This production will appear as <strong className="text-ink">{title}</strong>.
          </p>
          </>
          )}

          <div className="flex flex-col gap-2">
            {!live && <span className="font-semibold">Performances</span>}
            <datalist id="performance-labels">
              <option value="Opening night" />
              <option value="Matinee" />
              <option value="Preview" />
              <option value="Closing" />
            </datalist>
            {state.performances.map((p) =>
              p.editing ? (
                <div key={p.id} className="flex flex-col gap-2.5 border-b border-rule py-3.5">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
                    <SmallInput label="Date" type="date" value={p.date} onChange={(date) => setPerformance(p.id, { date })} />
                    <SmallInput label="Time" type="time" value={p.time} onChange={(time) => setPerformance(p.id, { time })} />
                    <SmallInput label="Label" optional list="performance-labels" placeholder="Matinee" value={p.label} onChange={(label) => setPerformance(p.id, { label })} />
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      className={pillDark}
                      onClick={() =>
                        update((s) => ({
                          ...s,
                          performances: s.performances.map((x) => (x.id === p.id ? { ...x, editing: false } : x)).sort(byDateTime),
                        }))
                      }
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className={pillLight}
                      onClick={() => update((s) => ({ ...s, performances: s.performances.filter((x) => x.id !== p.id) }))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule py-1">
                  <button
                    type="button"
                    onClick={() => setPerformance(p.id, { editing: true })}
                    className="flex-[1_1_180px] cursor-pointer border-0 bg-transparent p-0 text-left text-base text-ink"
                    aria-label={`Edit performance: ${formatPerformance(p)}`}
                  >
                    {formatPerformance(p)}
                  </button>
                  {p.label && (
                    <span className="text-sm font-semibold text-muted">{p.label}</span>
                  )}
                  <button
                    type="button"
                    aria-label="Remove this performance"
                    onClick={() => update((s) => ({ ...s, performances: s.performances.filter((x) => x.id !== p.id) }))}
                    className="flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent"
                  >
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5E5E5E" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              ),
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <button type="button" className={linkButton} onClick={addPerformance}>
                + Add a performance
              </button>
              <button type="button" className={linkButton} onClick={repeatWeekly}>
                + Repeat weekly
              </button>
            </div>
          </div>
        </section>

        {/* 4 · Cast and crew */}
        <section className={card} aria-labelledby="s-credits">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="s-credits" className="heading">{live ? "Cast and crew" : "4 · Cast and crew"}</h2>
            <div role="tablist" aria-label="Credit type" className="inline-flex rounded-lg bg-soft p-1">
              {(["cast", "crew"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => {
                    setTab(k);
                    setPasteOpen(false);
                  }}
                  className={`h-10 min-w-[88px] cursor-pointer rounded-md border-0 px-[18px] text-[15px] font-semibold ${
                    tab === k ? "bg-ink text-white" : "bg-transparent text-ink"
                  }`}
                >
                  {k === "cast" ? "Cast" : "Crew"}
                </button>
              ))}
            </div>
          </div>

          {visibleCredits.length === 0 && (
            <p className="m-0 text-muted">No {tab} added yet.</p>
          )}

          {visibleCredits.map((c) => (
            <CreditRowEditor
              key={c.id}
              row={c}
              onChange={(patch) => setCredit(c.id, patch)}
              onRemove={() => update((s) => ({ ...s, credits: s.credits.filter((x) => x.id !== c.id) }))}
            />
          ))}

          {pasteOpen && (
            <div className="flex flex-col gap-2.5 border-l-[3px] border-rule py-1 pl-4">
              <label htmlFor="f-paste" className="font-semibold">
                Paste the {tab} list, one per line
              </label>
              <span className="text-sm text-muted">
                Like <em>{tab === "cast" ? "Jo March: Jane Doe" : "Director: Jane Doe"}</em>. We’ll check each name against the database.
              </span>
              <textarea
                id="f-paste"
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="field p-3"
              />
              <div className="flex flex-wrap gap-2.5">
                <button type="button" className={pillDark} onClick={addPastedRows}>
                  Add these
                </button>
                <button type="button" className={pillLight} onClick={() => setPasteOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <button
              type="button"
              className={linkButton}
              onClick={() => update((s) => ({ ...s, credits: [...s.credits, emptyCredit(tab)] }))}
            >
              + Add a {tab} member
            </button>
            <button type="button" className={linkButton} onClick={() => setPasteOpen(true)}>
              + Paste a whole {tab} list
            </button>
          </div>
        </section>

        {/* 5 · Poster */}
        {(!live || state.poster) && (
          <section className={card} aria-labelledby="s-poster">
            <div className="flex flex-col gap-1">
              <h2 id="s-poster" className="heading">
                {live ? "Poster" : "5 · Poster"} <span className="text-base font-normal text-muted">(optional)</span>
              </h2>
              <p className="m-0 text-[15px] text-muted">
                The poster’s colors become the production page’s colors. Photos can be added on the production page once
                it’s live.
              </p>
            </div>
            <PosterField value={state.poster ?? null} onChange={(poster) => update((s) => ({ ...s, poster }))} />
          </section>
        )}
      </div>

      {/* Your submission */}
      <aside
        aria-labelledby="s-summary"
        className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 border-t-2 border-ink pt-4 lg:sticky lg:top-6"
      >
        <h2 id="s-summary" className="subheading">Your submission</h2>
        <p className="m-0 text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em]">{title}</p>
        <dl className="m-0 flex flex-col">
          <SummaryRow term="Show" value={summary.show} />
          <SummaryRow term="Production" value={summary.production} />
          <SummaryRow term="Company" value={summary.company} />
          <SummaryRow term="Location" value={summary.location} />
          <SummaryRow term="People" value={summary.people} />
          <SummaryRow term="Credits" value={String(summary.credits)} />
          <SummaryRow term="Performances" value={String(summary.performances)} />
          <SummaryRow term="Poster" value={summary.poster} last />
        </dl>
        <p className="m-0 text-sm text-muted">
          A moderator reviews new submissions before they go live. You’ll earn points when it’s approved.
        </p>
        {problems.length > 0 && (
          <div role="alert" className="callout flex flex-col gap-1.5 text-[15px]">
            <strong>Almost there:</strong>
            <ul className="m-0 flex flex-col gap-1 pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {notice && (
          <p role="status" className="m-0 text-sm text-muted">
            {notice}
          </p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onSubmit}
          className="btn-primary w-full"
        >
          {pending ? "Working…" : "Submit for review"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onSaveDraft}
          className="btn-secondary w-full"
        >
          Save draft
        </button>
        {(initial || notice?.startsWith("Draft saved")) && (
          <button type="button" disabled={pending} onClick={startOver} className={`${linkButton} self-center text-sm`}>
            Discard draft and start over
          </button>
        )}
      </aside>
    </div>
  );
}

function SummaryRow({ term, value, last }: { term: string; value: string; last?: boolean }) {
  const isNew = value === "New" || value === "Added";
  return (
    <div className={`flex justify-between gap-3 py-2.5 ${last ? "" : "border-b border-rule"}`}>
      <dt>{term}</dt>
      <dd className={`m-0 text-right ${isNew ? "font-semibold" : "text-muted"}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------
// One cast or crew row: Role + Person, then the person's status panel
// ---------------------------------------------------------------------
function CreditRowEditor({
  row,
  onChange,
  onRemove,
}: {
  row: CreditRow;
  onChange: (patch: Partial<CreditRow>) => void;
  onRemove: () => void;
}) {
  const roleId = `role-${row.id}`;
  const choice: Choice = row.choice;

  return (
    <div className="relative flex flex-col gap-2.5 border-b border-rule py-4 sm:pr-12">
      {/* On phones the button sits beside the short "Role" label instead of taking a column */}
      <button
        type="button"
        aria-label={`Remove this ${row.kind} row`}
        onClick={onRemove}
        className="absolute right-0 top-2 flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5E5E5E" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={roleId} className="text-[15px] font-semibold">Role</label>
          <input
            id={roleId}
            type="text"
            value={row.role}
            placeholder={row.kind === "cast" ? "Jo March" : "Director"}
            onChange={(e) => onChange({ role: e.target.value })}
            className={smallField}
          />
        </div>
        <TypeAhead
          kind="people"
          noun="person"
          label="Person"
          size="small"
          query={row.person}
          choice={choice.kind === "suggest" ? { kind: "none" } : choice}
          onQueryChange={(person) => onChange({ person, choice: { kind: "none" }, adultConfirmed: false })}
          onPick={(match: Match) => onChange({ person: match.label, choice: { kind: "existing", match } })}
          onAddNew={() => onChange({ choice: { kind: "new" } })}
          onLeaveUnresolved={(matches) =>
            onChange({ choice: matches.length ? { kind: "suggest", match: matches[0] } : { kind: "new" } })
          }
        />
      </div>

      {choice.kind === "existing" && (
        <PickedLine match={choice.match} onChange={() => onChange({ choice: { kind: "none" } })} />
      )}

      {choice.kind === "new" && row.person.trim() && (
        <NewPanel badge="New person" note="Not in the database yet. We’ll create their page.">
          <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[15px]">
            <input
              type="checkbox"
              checked={row.adultConfirmed}
              onChange={(e) => onChange({ adultConfirmed: e.target.checked })}
              className="mt-0.5 h-5 w-5 flex-none accent-ink"
            />
            <span>
              I confirm this person is <strong>18 or older</strong>.{" "}
              <span className="text-muted">Required. Minors aren’t listed on the site.</span>
            </span>
          </label>
        </NewPanel>
      )}

      {choice.kind === "suggest" && (
        <div className="callout flex flex-col gap-2.5">
          <span className="font-semibold">Did you mean {choice.match.label}?</span>
          <span className="text-sm text-muted">
            Already in the database with {choice.match.detail.charAt(0).toLowerCase() + choice.match.detail.slice(1)}.
          </span>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              className={pillDark}
              onClick={() => onChange({ person: choice.match.label, choice: { kind: "existing", match: choice.match } })}
            >
              Yes, use this person
            </button>
            <button type="button" className={pillLight} onClick={() => onChange({ choice: { kind: "new" } })}>
              No, someone new
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
