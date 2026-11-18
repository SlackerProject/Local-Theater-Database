"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MergeTable } from "@/lib/merge";
import type { PageHit } from "@/lib/page-search";
import { MergePanel } from "./duplicates/MergeTools";
import { resolveSuggestion } from "./actions";

const small = "min-h-10 px-4 text-sm";

// A member says two pages are the same: merge them (which marks this done)
// or say they're different
export function SameAsReview({ id, table, a, b }: { id: string; table: MergeTable; a: PageHit; b: PageHit }) {
  const router = useRouter();
  const [merging, setMerging] = useState(false);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const resolve = (merged: boolean) =>
    start(async () => {
      setError("");
      const r = await resolveSuggestion(id, merged, reply);
      if (r.ok) router.refresh();
      else setError(r.error ?? "That didn’t work.");
    });

  return (
    <div className="flex flex-col gap-3">
      {merging && <MergePanel table={table} a={a} b={b} onCancel={() => setMerging(false)} onDone={() => resolve(true)} />}
      {replying && (
        <label className="flex max-w-[620px] flex-col gap-1 text-sm font-semibold">
          Reply to the contributor <span className="font-normal text-muted">(shown on their submissions page)</span>
          <input autoFocus value={reply} onChange={(e) => setReply(e.target.value)} className="field h-10 px-3 text-base font-normal" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!merging && (
          <>
            <button type="button" disabled={pending} onClick={() => setMerging(true)} className={`btn-primary ${small}`}>
              Merge…
            </button>
            <button type="button" disabled={pending} onClick={() => resolve(false)} className={`btn-secondary ${small}`}>
              Not the same
            </button>
          </>
        )}
        {!replying && (
          <button type="button" onClick={() => setReplying(true)} className="btn-text text-[15px]">
            Add a reply
          </button>
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
