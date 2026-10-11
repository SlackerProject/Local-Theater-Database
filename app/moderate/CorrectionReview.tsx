"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewCorrection } from "./actions";

export type ReviewRow = { key: string; what: string; current: string; proposed: string };

const cell = "border border-[#CFCFCF] p-2.5 align-top text-left";

// One correction: tick the changes to keep, then approve them; the rest
// are left out. A correction that's only a note gets "Mark done".
export function CorrectionReview({ id, rows }: { id: string; rows: ReviewRow[] }) {
  const router = useRouter();
  const [keep, setKeep] = useState<Set<string>>(new Set(rows.map((r) => r.key)));
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = (accept: string[], noteOnlyDone = false) =>
    start(async () => {
      setError("");
      const r = await reviewCorrection(id, accept, reply, noteOnlyDone);
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
