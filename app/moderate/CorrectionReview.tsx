"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCrewPositions, reviewCorrection } from "./actions";
import { NewPositions } from "./NewPositions";

export type ReviewRow = {
  key: string;
  what: string;
  current: string;
  proposed: string;
  // A new person with the name of someone already on the site: linked to
  // them unless the moderator says it's a different person (distinctKey)
  sameName?: { distinctKey: string; name: string; match: { label: string; slug: string; detail: string | null } };
};

const cell = "border border-[#CFCFCF] p-2.5 align-top text-left";

// One correction: tick the changes to keep, then approve them; the rest
// are left out. A correction that's only a note gets "Mark done".
export function CorrectionReview({ id, rows, newPositions = [] }: { id: string; rows: ReviewRow[]; newPositions?: string[] }) {
  const router = useRouter();
  const [keep, setKeep] = useState<Set<string>>(new Set(rows.map((r) => r.key)));
  const [addPositions, setAddPositions] = useState<Set<string>>(new Set());
  const [distinct, setDistinct] = useState<Set<string>>(new Set());
  const sameNameRows = rows.filter((r) => r.sameName && keep.has(r.key));
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = (accept: string[], noteOnlyDone = false) =>
    start(async () => {
      setError("");
      // Approving: ticked "Other…" positions join the list first
      if (accept.length && addPositions.size) {
        const added = await addCrewPositions([...addPositions]);
        if (!added.ok) return setError(added.error ?? "Couldn’t add the new positions.");
      }
      // "Different person" answers ride along with the approved rows
      const extra = accept.length ? rows.filter((r) => r.sameName && accept.includes(r.key) && distinct.has(r.key)).map((r) => r.sameName!.distinctKey) : [];
      const r = await reviewCorrection(id, [...accept, ...extra], reply, noteOnlyDone);
      if (r.ok) router.refresh();
      else setError(r.error ?? "That didn’t work.");
    });

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 ? (
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr className="bg-soft">
              <th scope="col" className={`${cell} w-12`}>
                <span className="sr-only">Keep</span>
              </th>
              <th scope="col" className={cell}>What</th>
              <th scope="col" className={cell}>Current</th>
              <th scope="col" className={cell}>Proposed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const on = keep.has(r.key);
              return (
                <tr key={r.key} className={on ? "" : "text-muted"}>
                  <td className={cell}>
                    <input
                      type="checkbox"
                      aria-label={`Keep: ${r.what}`}
                      checked={on}
                      onChange={() =>
                        setKeep((s) => {
                          const next = new Set(s);
                          if (next.has(r.key)) next.delete(r.key);
                          else next.add(r.key);
                          return next;
                        })
                      }
                      className="h-5 w-5 accent-ink"
                    />
                  </td>
                  <td className={`${cell} font-semibold`}>{r.what}</td>
                  <td className={`${cell} whitespace-pre-line`}>{r.current || <span className="text-muted">—</span>}</td>
                  <td className={`${cell} whitespace-pre-line ${on ? "font-bold" : "line-through"}`}>{r.proposed || <span className="text-muted">— (empty)</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="m-0 text-[15px] text-muted">Only a note. Make any change yourself, then mark it done.</p>
      )}
      {sameNameRows.map((r) => {
        const s = r.sameName!;
        const different = distinct.has(r.key);
        return (
          <fieldset key={r.key} className="callout m-0 flex flex-col gap-1.5 border-0 text-[15px]">
            <legend className="float-left mb-1 w-full font-bold">{s.name} is already on the site. Is this the same person?</legend>
            {[false, true].map((isDifferent) => (
              <label key={String(isDifferent)} className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name={`same-${id}-${r.key}`}
                  checked={different === isDifferent}
                  onChange={() =>
                    setDistinct((d) => {
                      const next = new Set(d);
                      if (isDifferent) next.add(r.key);
                      else next.delete(r.key);
                      return next;
                    })
                  }
                  className="mt-1 h-4 w-4 flex-none accent-ink"
                />
                {isDifferent ? (
                  <span>
                    <strong>A different person</strong> with the same name (gets their own page)
                  </span>
                ) : (
                  <span>
                    <strong>Same person:</strong>{" "}
                    <a href={`/person/${s.match.slug}`} target="_blank" rel="noopener noreferrer">
                      {s.match.label}
                    </a>
                    {s.match.detail && <span className="text-muted"> ({s.match.detail})</span>}
                  </span>
                )}
              </label>
            ))}
          </fieldset>
        );
      })}
      <NewPositions positions={newPositions} selected={addPositions} onChange={setAddPositions} />
      <label className="flex max-w-[620px] flex-col gap-1 text-sm font-semibold">
        Reply to the contributor <span className="font-normal text-muted">(optional, shown on their submissions page)</span>
        <input value={reply} onChange={(e) => setReply(e.target.value)} className="field h-11 px-3 text-base font-normal" />
      </label>
      <div className="flex flex-wrap gap-2">
        {rows.length > 0 ? (
          <>
            <button type="button" disabled={pending || keep.size === 0} onClick={() => run([...keep])} className="btn-primary">
              {keep.size === rows.length ? "Approve all" : `Approve ${keep.size} of ${rows.length}`}
            </button>
            <button type="button" disabled={pending} onClick={() => run([])} className="btn-secondary">
              Reject all
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={pending} onClick={() => run([], true)} className="btn-primary">
              Mark done
            </button>
            <button type="button" disabled={pending} onClick={() => run([])} className="btn-secondary">
              Dismiss
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="callout m-0 font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
