"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveBug, setFeedbackKind } from "../actions";
import { FEEDBACK_KINDS } from "@/lib/feedback";

const small = "inline-flex min-h-10 cursor-pointer items-center rounded-md border border-[#CFCFCF] bg-page px-3 text-sm font-semibold hover:border-ink disabled:opacity-50";

// "Copy for Claude" puts the whole message on the clipboard, ready to paste
// into a chat; Kind re-sorts it; then mark it fixed (done) or dismiss it
export function BugActions({ id, kind, status, copyText }: { id: string; kind: string; status: string; copyText: string }) {
  const router = useRouter();
  const kindId = useId();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error ?? "That didn’t work.");
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(copyText).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2500);
            },
            () => setError("Couldn’t copy. Select the text under “Copy text” instead."),
          )
        }
        className="btn-primary min-h-10 px-4 text-sm"
      >
        {copied ? "Copied!" : "Copy for Claude"}
      </button>
      {status === "open" ? (
        <>
          <button type="button" disabled={pending} onClick={() => run(() => resolveBug(id, "fixed"))} className={small}>
            {kind === "bug" ? "Mark fixed" : "Mark done"}
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => resolveBug(id, "dismissed"))} className={small}>
            Dismiss
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => run(() => resolveBug(id, "open"))} className={small}>
          Reopen
        </button>
      )}
      <label htmlFor={kindId} className="ml-1 text-sm font-semibold">
        Kind
      </label>
      <select
        id={kindId}
        value={kind}
        disabled={pending}
        onChange={(e) => run(() => setFeedbackKind(id, e.target.value))}
        className="field h-10 px-2 text-sm"
      >
        {FEEDBACK_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-sm font-semibold">
          {error}
        </span>
      )}
    </div>
  );
}
