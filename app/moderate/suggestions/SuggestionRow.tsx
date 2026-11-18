"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { addAwardCredit, dismissAwardCredit } from "./actions";

export type Suggestion = {
  key: string;
  entryIds: string[];
  person: { slug: string; name: string };
  production: { slug: string; title: string; company: string };
  awards: string[];
  cast: boolean; //       performer awards add a cast credit (the role is the character)
  role: string; //        best guess, from the award
  credited: string | null; // already credited in the show as this
};

// One person missing from a show's credits: add them, or dismiss
export function SuggestionRow({ s }: { s: Suggestion }) {
  const id = useId();
  const [role, setRole] = useState(s.role);
  const [done, setDone] = useState<"" | "added" | "dismissed">("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, then: "added" | "dismissed") =>
    start(async () => {
      setError("");
      const r = await fn();
      if (r.ok) setDone(then);
      else setError(r.error);
    });

  return (
    <li className="flex flex-col gap-2 border-b border-rule py-3.5">
      <span className="flex flex-col">
        <span>
          <Link href={`/person/${s.person.slug}`} className="font-bold">
            {s.person.name}
          </Link>
          <span className="text-muted"> · </span>
          <Link href={`/production/${s.production.slug}`}>{s.production.title}</Link>
          <span className="text-muted"> · {s.production.company}</span>
        </span>
        <span className="text-[14px] text-muted">{s.awards.join(" · ")}</span>
      </span>
      {done ? (
        <span className="text-[15px] font-semibold">{done === "added" ? "✓ Added to the credits" : "Dismissed"}</span>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          {s.credited ? (
            <span className="self-center text-[15px]">Credited as {s.credited}</span>
          ) : (
            <span className="flex flex-col gap-1">
              <label htmlFor={id} className="text-sm font-semibold">
                {s.cast ? "Role" : "Position"}
              </label>
              <input id={id} value={role} onChange={(e) => setRole(e.target.value)} className="field h-10 w-[240px] px-3" />
            </span>
          )}
          <button
            type="button"
            disabled={pending || (!s.credited && !role.trim())}
            onClick={() => run(() => addAwardCredit(s.entryIds[0], role, s.production.slug), "added")}
            className="btn-primary min-h-10 px-4 text-sm"
          >
            {s.credited ? "Link award to credit" : s.cast ? "Add to cast" : "Add to crew"}
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => dismissAwardCredit(s.entryIds), "dismissed")} className="btn-text text-sm">
            Dismiss
          </button>
          {error && <span className="text-sm font-semibold text-alert">{error}</span>}
        </div>
      )}
    </li>
  );
}
