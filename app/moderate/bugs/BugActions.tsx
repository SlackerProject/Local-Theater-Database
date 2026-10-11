"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveBug } from "../actions";

const small = "inline-flex min-h-10 cursor-pointer items-center rounded-md border border-[#CFCFCF] bg-page px-3 text-sm font-semibold hover:border-ink disabled:opacity-50";

// "Copy for Claude" puts the whole report on the clipboard, ready to paste
// into a chat; then mark it fixed or dismiss it
export function BugActions({ id, status, copyText }: { id: string; status: string; copyText: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const set = (next: "open" | "fixed" | "dismissed") =>
    start(async () => {
      setError("");
      const r = await resolveBug(id, next);
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
          <button type="button" disabled={pending} onClick={() => set("fixed")} className={small}>
            Mark fixed
          </button>
          <button type="button" disabled={pending} onClick={() => set("dismissed")} className={small}>
            Dismiss
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => set("open")} className={small}>
          Reopen
        </button>
      )}
      {error && (
        <span role="alert" className="text-sm font-semibold">
          {error}
        </span>
      )}
    </div>
  );
}
