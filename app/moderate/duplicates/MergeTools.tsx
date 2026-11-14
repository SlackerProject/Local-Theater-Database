"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissDuplicate, mergePages, mergePreview, searchPages, type PageHit } from "./actions";
import { NOUN, PAGE_PATH as PATH, type MergeTable } from "@/lib/merge";

export type Side = { id: string; label: string; slug?: string; detail: string };


const MOVES: Record<string, string> = {
  credits: "credit",
  photos: "photo",
  followers: "follower",
  awards: "award",
  productions: "production",
  roles: "role",
  venues: "venue link",
  performances: "performance",
  auditions: "audition session",
  saved: "saved show",
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
// The bigger page is usually the one to keep: "12 productions · …" vs "1 production"
const weight = (s: Side) => Number(s.detail.match(/^\d+/)?.[0] ?? s.detail.match(/(\d+) (credits|productions)/)?.[1] ?? 0);
const small = "min-h-10 px-4 text-sm";

// Choose which page stays, see what moves, then merge
export function MergePanel({ table, a, b, onCancel, onDone }: { table: MergeTable; a: Side; b: Side; onCancel: () => void; onDone: () => void }) {
  const name = useId();
  const [keep, setKeep] = useState<"a" | "b">(weight(b) > weight(a) ? "b" : "a");
  const [summary, setSummary] = useState<Record<string, number | string | null> | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const kept = keep === "a" ? a : b;
  const gone = keep === "a" ? b : a;

  useEffect(() => {
    let live = true;
    mergePreview(table, kept.id, gone.id).then((r) => {
      if (!live) return;
      if (r.ok) setSummary(r.summary);
      else setError(r.error);
    });
    return () => {
      live = false;
      setSummary(null);
      setError("");
    };
  }, [table, kept.id, gone.id]);

  const moves = summary
    ? Object.entries(summary)
        .filter(([k, v]) => k !== "blocked" && typeof v === "number" && v > 0)
        .map(([k, v]) => plural(v as number, MOVES[k] ?? k))
    : [];
  const blocked = typeof summary?.blocked === "string" ? summary.blocked : "";

  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-ink p-4 text-[15px]">
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1 font-bold">Which {NOUN[table]} page stays?</legend>
        {(["a", "b"] as const).map((k) => {
          const s = k === "a" ? a : b;
          return (
            <label key={k} className="flex cursor-pointer items-start gap-2.5">
              <input type="radio" name={name} checked={keep === k} onChange={() => setKeep(k)} className="mt-1 h-[18px] w-[18px] flex-none accent-ink" />
              <span>
                <strong>{s.label}</strong> <span className="text-muted">· {s.detail}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {blocked ? (
        <p role="alert" className="callout m-0">
          {blocked}
        </p>
      ) : summary === null ? (
        !error && <p className="m-0 text-muted">Checking what moves…</p>
      ) : (
        <p className="m-0">
          {moves.length ? <>Moves {moves.join(", ")} from the other page to the one you keep</> : <>The other page has nothing else to move</>}, fills in
          anything the kept page is missing, then deletes the other page. Its old address will forward to the kept one.{" "}
          <strong>This can’t be undone.</strong>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !summary || !!blocked}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await mergePages(table, kept.id, gone.id);
              if (r.ok) onDone();
              else setError(r.error);
            })
          }
          className={`btn-primary ${small}`}
        >
          {pending ? "Merging…" : "Merge"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={`btn-secondary ${small}`}>
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-sm font-semibold text-alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

// One flagged pair: open both, merge, or "Not a duplicate"
export function DuplicatePair({ table, a, b, reason }: { table: MergeTable; a: Side; b: Side; reason: string }) {
  const router = useRouter();
  const [merging, setMerging] = useState(false);
  const [done, setDone] = useState<"" | "merged" | "dismissed">("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (done)
    return (
      <li className="border-b border-rule py-3 text-[15px] text-muted">
        {done === "merged" ? `Merged: ${a.label}` : `Marked as different: ${a.label} and ${b.label}`}
      </li>
    );

  const side = (s: Side) => (
    <span className="flex min-w-0 flex-col">
      <a href={`/${PATH[table]}/${s.slug}`} target="_blank" rel="noopener noreferrer" className="font-semibold">
        {s.label}
      </a>
      <span className="text-sm text-muted">{s.detail}</span>
    </span>
  );

  return (
    <li className="flex flex-col gap-3 border-b border-rule py-3">
      <div className="grid gap-x-6 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
        {side(a)}
        {side(b)}
        <span className="flex flex-wrap gap-2 md:justify-end">
          {!merging && (
            <>
              <button type="button" onClick={() => setMerging(true)} className={`btn-primary ${small}`}>
                Merge…
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await dismissDuplicate(table, a.id, b.id);
                    if (r.ok) {
                      setDone("dismissed");
                      router.refresh();
                    } else setError(r.error);
                  })
                }
                className={`btn-secondary ${small}`}
              >
                Not a duplicate
              </button>
            </>
          )}
        </span>
      </div>
      <span className="-mt-2 text-[13px] text-muted">{reason}</span>
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-alert">
          {error}
        </p>
      )}
      {merging && (
        <MergePanel
          table={table}
          a={a}
          b={b}
          onCancel={() => setMerging(false)}
          onDone={() => {
            setDone("merged");
            router.refresh();
          }}
        />
      )}
    </li>
  );
}

// Pick a page by name
function PagePicker({ table, label, value, onPick, exclude }: { table: MergeTable; label: string; value: Side | null; onPick: (s: Side | null) => void; exclude?: string }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PageHit[]>([]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      if (q.trim().length < 2) return setHits([]);
      searchPages(table, q).then((h) => live && setHits(h));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, table]);

  if (value)
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{label}</span>
        <span className="flex items-center gap-2 rounded-md border border-rule px-3 py-2">
          <span className="min-w-0 flex-1">
            <strong>{value.label}</strong> <span className="text-sm text-muted">· {value.detail}</span>
          </span>
          <button type="button" onClick={() => onPick(null)} className="btn-text text-sm">
            Change
          </button>
        </span>
      </div>
    );

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Type a ${NOUN[table]}’s name`} className="field h-11 px-3" autoComplete="off" />
      {hits.length > 0 && (
        <ul className="m-0 flex list-none flex-col rounded-md border border-rule p-0">
          {hits
            .filter((h) => h.id !== exclude)
            .map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({ id: h.id, label: h.label, detail: h.detail });
                    setQ("");
                    setHits([]);
                  }}
                  className="w-full cursor-pointer border-0 border-b border-rule bg-transparent px-3 py-2 text-left hover:bg-soft"
                >
                  <strong>{h.label}</strong> <span className="text-sm text-muted">· {h.detail}</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// "Merge any two pages", for duplicates the list doesn't catch
export function ManualMerge() {
  const router = useRouter();
  const [table, setTable] = useState<MergeTable>("people");
  const [a, setA] = useState<Side | null>(null);
  const [b, setB] = useState<Side | null>(null);
  const [merged, setMerged] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What to merge">
        {(Object.keys(NOUN) as MergeTable[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={table === t}
            onClick={() => {
              setTable(t);
              setA(null);
              setB(null);
              setMerged("");
            }}
            className={`min-h-10 cursor-pointer rounded-full border px-4 text-sm font-semibold ${table === t ? "border-ink bg-ink text-white" : "border-[#CFCFCF] bg-page text-ink hover:border-ink"}`}
          >
            {NOUN[t][0].toUpperCase() + NOUN[t].slice(1)}s
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <PagePicker table={table} label="First page" value={a} onPick={setA} exclude={b?.id} />
        <PagePicker table={table} label="Second page" value={b} onPick={setB} exclude={a?.id} />
      </div>
      {merged && (
        <p role="status" className="callout m-0 text-[15px]">
          Merged into {merged}.
        </p>
      )}
      {a && b && (
        <MergePanel
          key={`${a.id}-${b.id}`}
          table={table}
          a={a}
          b={b}
          onCancel={() => setB(null)}
          onDone={() => {
            setMerged(a.label);
            setA(null);
            setB(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
