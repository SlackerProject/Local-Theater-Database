"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { NOUN, type MergeTable } from "@/lib/merge";
import type { PageHit } from "@/lib/page-search";
import { findOtherPages, reportSamePage } from "../../actions";

// "This is the same person as another page": pick the other page and say
// why (e.g. "former last name"); a moderator merges them
export function SameAsLink({ table, id, name, pagePath }: { table: MergeTable; id: string; name: string; pagePath: string }) {
  const noun = NOUN[table];
  const ids = { q: useId(), why: useId() };
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PageHit[]>([]);
  const [other, setOther] = useState<PageHit | null>(null);
  const [why, setWhy] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (other || q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => findOtherPages(table, q).then((h) => live && setHits(h.filter((x) => x.id !== id))), 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, other, table, id]);

  if (sent)
    return (
      <p role="status" className="callout m-0 text-[15px]">
        Thanks. A moderator will check {name} and {other?.label} and merge them if they’re the same {noun}.
      </p>
    );

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-text self-start text-[15px]">
        Is this the same {noun} as another page?
      </button>
    );

  return (
    <section aria-label={`Same ${noun} as another page`} className="flex max-w-[620px] flex-col gap-3 rounded-lg border border-rule p-4">
      <p className="m-0 text-[15px]">
        Pick the other page and a moderator will merge the two, so everything is in one place.
      </p>
      {other ? (
        <span className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Same {noun} as</span>
          <span className="flex items-center gap-2 rounded-md border border-rule px-3 py-2">
            <span className="min-w-0 flex-1">
              <strong>{other.label}</strong> <span className="text-sm text-muted">· {other.detail}</span>
            </span>
            <button type="button" onClick={() => setOther(null)} className="btn-text text-sm">
              Change
            </button>
          </span>
        </span>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.q} className="text-sm font-semibold">
            Same {noun} as
          </label>
          <input id={ids.q} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Type the other ${noun}’s name`} className="field h-11 px-3" autoComplete="off" />
          {q.trim().length >= 2 && hits.length > 0 && (
            <ul className="m-0 flex list-none flex-col rounded-md border border-rule p-0">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOther(h);
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
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.why} className="text-sm font-semibold">
          Why? <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id={ids.why} value={why} maxLength={500} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Former last name, or a misspelling" className="field h-11 px-3" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !other}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await reportSamePage(table, id, other!.id, why, pagePath);
              if (r.ok) setSent(true);
              else setError(r.error);
            })
          }
          className="btn-primary min-h-10 px-4 text-sm"
        >
          {pending ? "Sending…" : "Send to a moderator"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-secondary min-h-10 px-4 text-sm">
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-sm font-semibold text-alert">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
