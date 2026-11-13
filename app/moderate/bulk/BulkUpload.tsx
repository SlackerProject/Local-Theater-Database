"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AI_INSTRUCTIONS,
  CREDIT_COLUMNS,
  PRODUCTION_COLUMNS,
  buildBulkBundle,
  classifySheet,
  entityKey,
  parseBulk,
  townFor,
  type BulkCredit,
  type BulkPreview,
  type BulkProduction,
  type Cell,
  type Created,
  type ParsedBulk,
} from "@/lib/bulk";
import { personNameKey } from "@/lib/submission";
import { unlistedPositions } from "@/lib/positions";
import { finishBulk, importBulkProduction, previewBulk, startBulk, undoBulk } from "./actions";

type Choice = "replace" | "skip";
type Result = { ref: string; title: string; status: "added" | "replaced" | "skipped" | "failed"; slug?: string; error?: string };
type Step = "start" | "review" | "importing" | "done";

const small = "min-h-10 px-4 text-sm";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------
// The template, made in the browser
// ---------------------------------------------------------------------
async function downloadTemplate() {
  await (await templateFile()).toFile("Local Theater Database bulk upload.xlsx");
}

export async function templateFile() {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const header = (cols: typeof PRODUCTION_COLUMNS) => cols.map((c) => ({ value: c.header, fontWeight: "bold" as const, backgroundColor: "#EDEDED" }));
  const guide = [
    [bold("Local Theater Database: bulk upload template")],
    ["Fill in the Productions and Credits tabs, then upload this file on Moderation → Bulk Upload. Don’t rename tabs or columns."],
    [""],
    [bold("Instructions for an AI tool (copy everything below into Claude with your sources)")],
    ...AI_INSTRUCTIONS.split("\n").map((line) => [line]),
    [""],
    [bold("Tab"), bold("Column"), bold("Required"), bold("What to put"), bold("Example")],
    ...PRODUCTION_COLUMNS.map((c) => ["Productions", c.header, c.required ? "Yes" : "", c.help, c.example]),
    ...CREDIT_COLUMNS.map((c) => ["Credits", c.header, c.required ? "Yes" : "", c.help, c.example]),
  ];
  return writeXlsxFile(
    [
      { sheet: "Instructions", data: guide, columns: [{ width: 14 }, { width: 18 }, { width: 10 }, { width: 70 }, { width: 40 }] },
      { sheet: "Productions", data: [header(PRODUCTION_COLUMNS)], columns: PRODUCTION_COLUMNS.map((c) => ({ width: Math.max(12, c.header.length + 4) })), stickyRowsCount: 1 },
      { sheet: "Credits", data: [header(CREDIT_COLUMNS)], columns: CREDIT_COLUMNS.map((c) => ({ width: Math.max(12, c.header.length + 6) })), stickyRowsCount: 1 },
    ],
  );
}

// .xlsx (both tabs) or .csv files (one per tab)
async function readFiles(files: File[]): Promise<{ productions: Cell[][] | null; credits: Cell[][] | null }> {
  let productions: Cell[][] | null = null;
  let credits: Cell[][] | null = null;
  for (const file of files) {
    if (/\.xlsx$/i.test(file.name)) {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      for (const s of await readXlsxFile(file)) {
        const rows = s.data as unknown as Cell[][];
        const kind = classifySheet(s.sheet, rows);
        if (kind === "productions" && !productions) productions = rows;
        if (kind === "credits" && !credits) credits = rows;
      }
    } else if (/\.(csv|txt)$/i.test(file.name)) {
      const { default: Papa } = await import("papaparse");
      const rows = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" }).data as Cell[][];
      const kind = classifySheet(file.name.replace(/\.[^.]+$/, ""), rows);
      if (kind === "productions") productions = rows;
      if (kind === "credits") credits = rows;
    } else {
      throw new Error(`“${file.name}” isn’t an Excel (.xlsx) or CSV file.`);
    }
  }
  return { productions, credits };
}

// ---------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------
export function BulkUpload({ maxYear }: { maxYear: number }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [parsed, setParsed] = useState<ParsedBulk | null>(null);
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [people, setPeople] = useState<Record<string, string>>({}); // nameKey -> person id or "new"
  const [adults, setAdults] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [results, setResults] = useState<Result[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [undone, setUndone] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  async function load(files: File[]) {
    if (!files.length) return;
    setError("");
    setBusy(true);
    try {
      const { productions, credits } = await readFiles(files);
      const p = parseBulk(productions, credits, maxYear);
      if (!p.productions.length) {
        setError(p.issues[0]?.message ?? "No productions were found in that file.");
        return;
      }
      const names = [...new Set(p.credits.filter((c) => !c.young).map((c) => c.person))];
      const r = await previewBulk({
        productions: p.productions.map((x) => ({ ref: x.ref, show: x.show, company: x.company, venue: x.venue, venueTown: x.venueTown, year: x.year })),
        people: names,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Someone already on the site under that name: linked to them unless
      // there are two (then the moderator picks)
      const defaults: Record<string, string> = {};
      for (const [key, matches] of Object.entries(r.preview.people)) if (matches.length === 1) defaults[key] = matches[0].id;
      setFileName(files.map((f) => f.name).join(" + "));
      setParsed(p);
      setPreview(r.preview);
      setPeople(defaults);
      setChoices({});
      setAdults(false);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn’t be read.");
    } finally {
      setBusy(false);
    }
  }

  // ----- what the review shows -----
  const review = useMemo(() => {
    if (!parsed || !preview) return null;
    const creditsBy = new Map<string, BulkCredit[]>();
    for (const c of parsed.credits) creditsBy.set(c.ref, [...(creditsBy.get(c.ref) ?? []), c]);

    const newShows = new Map<string, string>();
    const newCompanies = new Map<string, string>();
    const newVenues = new Map<string, string>();
    const rows = parsed.productions.map((p) => {
      const problems = parsed.issues.filter((i) => i.ref === p.ref).map((i) => (i.sheet === "Credits" ? `Credits row ${i.row}: ${i.message}` : i.message));
      const showNew = !preview.shows[entityKey(p.show)];
      const companyNew = !preview.companies[entityKey(p.company)];
      const venueNew = !!p.venue && !preview.venues[entityKey(p.venue)];
      if (companyNew && p.companyTown && !townFor(p.companyTown)) problems.push(`Company town “${p.companyTown}” isn’t a Massachusetts city or town.`);
      if (venueNew && p.venueTown && !townFor(p.venueTown)) problems.push(`Venue town “${p.venueTown}” isn’t a Massachusetts city or town.`);
      // Only what will actually be created (rows left out don't count)
      if (!problems.length) {
        if (showNew && p.show) newShows.set(entityKey(p.show), p.show);
        if (companyNew && p.company) newCompanies.set(entityKey(p.company), p.company);
        if (venueNew) newVenues.set(entityKey(p.venue), p.venue);
      }
      const notes: string[] = [];
      if (showNew && !p.showType) notes.push("New show with no type; it will be listed as Other.");
      if (!(creditsBy.get(p.ref) ?? []).length) notes.push("No cast or crew listed.");
      return { p, credits: creditsBy.get(p.ref) ?? [], problems, notes, existing: preview.existing[p.ref] ?? null };
    });

    const names = new Map<string, string>();
    for (const c of parsed.credits) if (!c.young) names.set(personNameKey(c.person), c.person);
    const newPeople = [...names.entries()].filter(([k]) => !(preview.people[k]?.length)).map(([, n]) => n);
    const matched = [...names.entries()].filter(([k]) => preview.people[k]?.length).map(([key, name]) => ({ key, name, matches: preview.people[key] }));
    const fileIssues = parsed.issues.filter((i) => !i.ref || !parsed.productions.some((p) => p.ref === i.ref));
    const newPositions = unlistedPositions(
      parsed.credits.filter((c) => c.kind === "crew").map((c) => c.role),
      preview.positions,
    );
    return { rows, newShows: [...newShows.values()], newCompanies: [...newCompanies.values()], newVenues: [...newVenues.values()], newPeople, matched, fileIssues, newPositions };
  }, [parsed, preview]);

  const toImport = review?.rows.filter((r) => !r.problems.length && (!r.existing || choices[r.p.ref] === "replace")) ?? [];
  const undecided = review?.rows.filter((r) => !r.problems.length && r.existing && !choices[r.p.ref]) ?? [];
  const unpicked = review?.matched.filter((m) => m.matches.length > 1 && !people[m.key]) ?? [];
  const canImport = !!review && toImport.length > 0 && !undecided.length && !unpicked.length && adults;

  async function runImport() {
    if (!review || !preview || !parsed) return;
    setStep("importing");
    setError("");
    const start = await startBulk(fileName, review.newPositions);
    if (!start.ok) {
      setError(start.error);
      setStep("review");
      return;
    }
    setBatchId(start.id);
    const created: Created = { shows: {}, companies: {}, venues: {}, people: {} };
    const out: Result[] = review.rows
      .filter((r) => r.problems.length || (r.existing && choices[r.p.ref] === "skip"))
      .map((r) => ({ ref: r.p.ref, title: `${r.p.show} (${r.p.year ?? "?"})`, status: r.problems.length ? "failed" : "skipped", error: r.problems[0] }));
    const queue = review.rows.filter((r) => toImport.includes(r));
    setProgress({ done: 0, total: queue.length, current: "" });

    for (const [i, r] of queue.entries()) {
      const title = `${r.p.show} (${r.p.year})`;
      setProgress({ done: i, total: queue.length, current: title });
      const bundle = buildBulkBundle(r.p, r.credits, preview, created, people);
      const note = `Bulk upload: ${fileName}${r.p.source ? `\nSource: ${r.p.source}` : ""}`;
      const res = await importBulkProduction(start.id, bundle, r.existing && choices[r.p.ref] === "replace" ? { id: r.existing.id } : null, note);
      if (res.ok) {
        created.shows[entityKey(r.p.show)] ??= { id: res.showId, label: r.p.show };
        created.companies[entityKey(r.p.company)] ??= { id: res.companyId, label: r.p.company };
        if (r.p.venue && res.venueId) created.venues[entityKey(r.p.venue)] ??= { id: res.venueId, label: r.p.venue };
        for (const person of res.people) created.people[person.key] ??= { id: person.id, label: person.label };
        out.push({ ref: r.p.ref, title, status: r.existing ? "replaced" : "added", slug: res.slug });
      } else {
        out.push({ ref: r.p.ref, title, status: "failed", error: res.error });
      }
    }
    setProgress({ done: queue.length, total: queue.length, current: "" });
    await finishBulk();
    setResults(out);
    setStep("done");
    router.refresh();
  }

  async function undo() {
    if (!batchId || !confirm("Remove every production this upload added? Replaced productions keep the file’s cast and crew.")) return;
    setBusy(true);
    const r = await undoBulk(batchId);
    setBusy(false);
    if (r.ok) {
      setUndone(r.removed);
      router.refresh();
    } else setError(r.error);
  }

  function reset() {
    setStep("start");
    setParsed(null);
    setPreview(null);
    setResults([]);
    setBatchId(null);
    setUndone(null);
    setError("");
  }

  // ===================================================================
  if (step === "start") {
    return (
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-lg border border-rule p-5">
          <h2 className="heading">1. Get the Template</h2>
          <p className="m-0 max-w-[720px] text-[15px] text-muted">
            An Excel file with two tabs: <strong className="text-ink">Productions</strong> (one row per production) and{" "}
            <strong className="text-ink">Credits</strong> (one row per person per role), joined by a short Ref like P1. Its
            Instructions tab explains every column.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={downloadTemplate} className={`btn-primary ${small}`}>
              Download the template
            </button>
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText(AI_INSTRUCTIONS).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                })
              }
              className={`btn-secondary ${small}`}
            >
              {copied ? "Copied!" : "Copy instructions for Claude"}
            </button>
          </div>
          <p className="m-0 text-sm text-muted">
            Using Claude: paste the instructions along with the company’s history page or programs, and ask it to fill in the template.
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-rule p-5">
          <h2 className="heading">2. Upload the Filled-In File</h2>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              load([...e.dataTransfer.files]);
            }}
            className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center ${
              dragging ? "border-ink bg-soft" : "border-[#CFCFCF]"
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.csv"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                load([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            <span className="font-bold">{busy ? "Reading the file…" : "Choose a file, or drop it here"}</span>
            <span className="text-sm text-muted">The template (.xlsx), or two CSV files: one for Productions, one for Credits.</span>
          </label>
          <p className="m-0 text-sm text-muted">Nothing is saved until you review it and press Import.</p>
          {error && (
            <p role="alert" className="callout m-0 text-[15px]">
              {error}
            </p>
          )}
        </section>
      </div>
    );
  }

  if (!review || !parsed) return null;

  // ===================================================================
  if (step === "importing") {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-rule p-5" aria-live="polite">
        <h2 className="heading">Importing…</h2>
        <div className="h-3 w-full overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-ink transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="m-0 text-[15px]">
          {progress.done} of {progress.total}
          {progress.current && <span className="text-muted"> · {progress.current}</span>}
        </p>
        <p className="m-0 text-sm text-muted">Keep this page open until it finishes.</p>
      </section>
    );
  }

  // ===================================================================
  if (step === "done") {
    const count = (s: Result["status"]) => results.filter((r) => r.status === s).length;
    return (
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-lg border border-rule p-5">
          <h2 className="heading">Upload Finished</h2>
          <p className="m-0 text-[17px]">
            <strong>{count("added")}</strong> added · <strong>{count("replaced")}</strong> replaced · {count("skipped")} skipped ·{" "}
            {count("failed")} not imported
          </p>
          {undone !== null ? (
            <p role="status" className="callout m-0 text-[15px]">
              Undone: {undone} {undone === 1 ? "production" : "productions"} removed.
            </p>
          ) : (
            <p className="m-0 text-sm text-muted">Something wrong? You can undo this upload for 7 days, here or from the list below.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reset} className={`btn-primary ${small}`}>
              Upload another file
            </button>
            {undone === null && batchId && count("added") + count("replaced") > 0 && (
              <button type="button" onClick={undo} disabled={busy} className={`btn-secondary ${small}`}>
                Undo this upload
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="callout m-0 text-[15px]">
              {error}
            </p>
          )}
        </section>
        <ul className="m-0 flex list-none flex-col border-t border-rule p-0 text-[15px]">
          {results.map((r) => (
            <li key={r.ref} className="flex flex-wrap items-baseline gap-x-3 border-b border-rule py-2">
              <span className={`w-20 flex-none text-sm font-bold ${r.status === "failed" ? "text-alert" : "text-muted"}`}>
                {{ added: "Added", replaced: "Replaced", skipped: "Skipped", failed: "Not imported" }[r.status]}
              </span>
              {r.slug && undone === null ? <Link href={`/production/${r.slug}`}>{r.title}</Link> : <span>{r.title}</span>}
              <span className="text-sm text-muted">{r.ref}</span>
              {r.error && <span className="w-full pl-[92px] text-sm text-alert">{r.error}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ===================================================================
  // Review
  const blocked = review.rows.filter((r) => r.problems.length);
  const existing = review.rows.filter((r) => !r.problems.length && r.existing);
  const castTotal = toImport.reduce((n, r) => n + r.credits.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-lg border border-rule p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="heading">3. Review {fileName}</h2>
          <button type="button" onClick={reset} className="btn-text text-[15px]">
            Choose a different file
          </button>
        </div>
        <p className="m-0 text-[15px]">
          <strong>{plural(review.rows.length, "production")}</strong> · <strong>{plural(parsed.credits.length, "cast and crew line")}</strong> ·{" "}
          {plural(review.newShows.length, "new show")} · {plural(review.newCompanies.length, "new company", "new companies")} ·{" "}
          {plural(review.newVenues.length, "new venue")} · {plural(review.newPeople.length, "new person", "new people")}
        </p>
        {review.fileIssues.map((i, n) => (
          <p key={n} className="m-0 text-sm text-alert">
            {i.sheet}
            {i.row ? `, row ${i.row}` : ""}: {i.message}
          </p>
        ))}
      </section>

      {blocked.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="subheading">Fix in the Spreadsheet ({blocked.length})</h3>
          <p className="m-0 text-[15px] text-muted">
            These will be left out. Fix them in the file and upload it again, or import the rest now and add these later.
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
            {blocked.map((r) => (
              <li key={r.p.ref}>
                <strong>
                  {r.p.ref} · {r.p.show || "(no title)"} {r.p.year ? `(${r.p.year})` : ""}
                </strong>{" "}
                <span className="text-alert">{r.problems.join(" ")}</span> <span className="text-sm text-muted">(row {r.p.row})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {existing.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="subheading">Already on the Site ({existing.length}): Replace or Skip?</h3>
            <span className="flex gap-2">
              <button type="button" className={`btn-secondary ${small}`} onClick={() => setChoices((c) => ({ ...c, ...Object.fromEntries(existing.map((r) => [r.p.ref, "replace"])) }))}>
                Replace all
              </button>
              <button type="button" className={`btn-secondary ${small}`} onClick={() => setChoices((c) => ({ ...c, ...Object.fromEntries(existing.map((r) => [r.p.ref, "skip"])) }))}>
                Skip all
              </button>
            </span>
          </div>
          <p className="m-0 text-[15px] text-muted">
            <strong className="text-ink">Replace</strong> swaps the production’s cast, crew and dates for the file’s (its page, poster,
            photos and followers stay). <strong className="text-ink">Skip</strong> leaves it as it is.
          </p>
          <ul className="m-0 flex list-none flex-col border-t border-rule p-0 text-[15px]">
            {existing.map((r) => (
              <li key={r.p.ref} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule py-2">
                <span className="min-w-0 flex-1">
                  <Link href={`/production/${r.existing!.slug}`} target="_blank" className="font-semibold">
                    {r.existing!.label}
                  </Link>{" "}
                  <span className="text-sm text-muted">
                    on the site: {r.existing!.credits} credits, {r.existing!.performances} dates · in the file: {r.credits.length} credits,{" "}
                    {r.p.performances.length} dates
                  </span>
                </span>
                <span className="flex gap-3" role="radiogroup" aria-label={`${r.existing!.label}: replace or skip`}>
                  {(["replace", "skip"] as const).map((c) => (
                    <label key={c} className="flex min-h-10 cursor-pointer items-center gap-1.5 text-[15px]">
                      <input
                        type="radio"
                        name={`choice-${r.p.ref}`}
                        checked={choices[r.p.ref] === c}
                        onChange={() => setChoices((x) => ({ ...x, [r.p.ref]: c }))}
                        className="h-[18px] w-[18px] accent-ink"
                      />
                      {c === "replace" ? "Replace" : "Skip"}
                    </label>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.matched.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="subheading">People Already on the Site ({review.matched.length})</h3>
          <p className="m-0 text-[15px] text-muted">
            These names match someone on the site, so they’ll be linked to that person’s page. Choose where there’s more than one, or
            mark a different person with the same name.
          </p>
          <ul className="m-0 flex list-none flex-col border-t border-rule p-0 text-[15px]">
            {review.matched.map((m) => (
              <li key={m.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule py-1.5">
                <span className="min-w-[180px] font-semibold">{m.name}</span>
                <select
                  value={people[m.key] ?? ""}
                  onChange={(e) => setPeople((p) => ({ ...p, [m.key]: e.target.value }))}
                  aria-label={`Who is ${m.name}?`}
                  className={`field h-10 max-w-full px-2 text-[15px] ${m.matches.length > 1 && !people[m.key] ? "border-alert" : ""}`}
                >
                  {m.matches.length > 1 && <option value="">Choose…</option>}
                  {m.matches.map((x) => (
                    <option key={x.id} value={x.id}>
                      Same person: {x.label}
                      {x.detail ? ` (${x.detail})` : ""}
                    </option>
                  ))}
                  <option value="new">A different person (new page)</option>
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(review.newShows.length > 0 || review.newCompanies.length > 0 || review.newVenues.length > 0 || review.newPositions.length > 0) && (
        <section className="flex flex-col gap-2">
          <h3 className="subheading">New to the Site</h3>
          <p className="m-0 text-[15px] text-muted">These will be created. Check the spelling: a typo makes a second page.</p>
          {(
            [
              ["Shows", review.newShows],
              ["Companies", review.newCompanies],
              ["Venues", review.newVenues],
              ["Crew positions", review.newPositions],
            ] as const
          ).map(([label, list]) =>
            list.length ? (
              <p key={label} className="m-0 text-[15px]">
                <strong>{label}:</strong> {list.join(", ")}
              </p>
            ) : null,
          )}
          {review.newPeople.length > 0 && (
            <details className="text-[15px]">
              <summary className="cursor-pointer font-semibold">New people ({review.newPeople.length})</summary>
              <p className="m-0 mt-1">{review.newPeople.join(", ")}</p>
            </details>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="subheading">Productions ({review.rows.length})</h3>
        <ul className="m-0 flex list-none flex-col border-t border-rule p-0 text-[15px]">
          {review.rows.map((r) => (
            <ProductionRow key={r.p.ref} row={r} choice={choices[r.p.ref]} />
          ))}
        </ul>
      </section>

      <section className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-rule bg-page px-4 py-4 md:-mx-8 md:px-8">
        <label className="flex cursor-pointer items-start gap-2.5 text-[15px]">
          <input type="checkbox" checked={adults} onChange={(e) => setAdults(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-ink" />
          <span>
            Everyone named in this file is <strong>18 or older today</strong>. Anyone under 18 is marked “Under 18” and will be credited by role
            only.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={runImport} disabled={!canImport} className={`btn-primary ${small}`}>
            Import {toImport.length} {toImport.length === 1 ? "production" : "productions"}
            {castTotal ? ` with ${castTotal} credits` : ""}
          </button>
          <span className="text-sm text-muted">
            {undecided.length > 0
              ? `Choose Replace or Skip for ${undecided.length} ${undecided.length === 1 ? "production" : "productions"} above.`
              : unpicked.length > 0
                ? `Choose who ${unpicked.length === 1 ? "1 person is" : `${unpicked.length} people are`} above.`
                : !adults
                  ? "Tick the box to confirm everyone named is 18 or older."
                  : "Goes live right away. You can undo it for 7 days."}
          </span>
        </div>
        {error && (
          <p role="alert" className="callout m-0 text-[15px]">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function ProductionRow({
  row,
  choice,
}: {
  row: { p: BulkProduction; credits: BulkCredit[]; problems: string[]; notes: string[]; existing: BulkPreview["existing"][string] | null };
  choice?: Choice;
}) {
  const { p, credits, problems, notes, existing } = row;
  const status = problems.length
    ? { label: "Fix in file", tone: "text-alert" }
    : existing
      ? choice === "replace"
        ? { label: "Replace", tone: "" }
        : choice === "skip"
          ? { label: "Skip", tone: "text-muted" }
          : { label: "Choose", tone: "text-alert" }
      : { label: "Ready", tone: "" };
  const cast = credits.filter((c) => c.kind === "cast");
  const crew = credits.filter((c) => c.kind === "crew");
  const dates = p.opening && p.closing ? `${p.opening} – ${p.closing}` : p.opening ?? "";
  const line = (c: BulkCredit) => `${c.understudy ? "U/S " : ""}${c.role}: ${c.young ? "Under 18 (no name)" : c.person}`;

  return (
    <li className="border-b border-rule">
      <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
          <span className={`w-20 flex-none text-sm font-bold ${status.tone}`}>{status.label}</span>
          <span className="min-w-0 flex-1">
            <strong>
              {p.show || "(no title)"} {p.year ? `(${p.year})` : ""}
            </strong>{" "}
            <span className="text-muted">
              · {p.company}
              {p.venue && ` · ${p.venue}`}
              {dates && ` · ${dates}`}
            </span>
          </span>
          <span className="text-sm text-muted">
            {p.ref} · {cast.length} cast · {crew.length} crew
            {p.performances.length ? ` · ${p.performances.length} dates` : ""}
          </span>
        </summary>
        <div className="flex flex-col gap-1.5 pb-3 pl-[92px] text-sm">
          {problems.map((m) => (
            <span key={m} className="text-alert">
              {m}
            </span>
          ))}
          {notes.map((m) => (
            <span key={m} className="text-muted">
              {m}
            </span>
          ))}
          {cast.length > 0 && (
            <p className="m-0">
              <strong>Cast:</strong> {cast.map(line).join(" · ")}
            </p>
          )}
          {crew.length > 0 && (
            <p className="m-0">
              <strong>Crew:</strong> {crew.map(line).join(" · ")}
            </p>
          )}
          {p.source && <span className="text-muted">Source: {p.source}</span>}
        </div>
      </details>
    </li>
  );
}
