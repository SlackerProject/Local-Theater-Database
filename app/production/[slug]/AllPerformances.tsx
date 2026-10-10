"use client";

import { useId, useState } from "react";

type Row = { when: string; label: string | null; cancelled: boolean };

// The hero's "All performances" button: opens the dates in place.
// Hero buttons use the show's ink on its ground (DESIGN.md).
export function AllPerformances({ performances, ink, ground }: { performances: Row[]; ink: string; ground: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!performances.length) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-3">
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="btn-secondary gap-2"
          style={{ color: ink }}
        >
          All performances
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={open ? "rotate-180" : ""}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && (
        <ul id={id} className="m-0 flex max-w-[520px] list-none flex-col p-0" style={{ color: ink }}>
          {performances.map((p, i) => (
            <li
              key={i}
              className="flex flex-wrap justify-between gap-x-4 py-2"
              style={{ borderBottom: `1px solid color-mix(in srgb, ${ink} 18%, ${ground})` }}
            >
              <span className={p.cancelled ? "line-through opacity-70" : ""}>
                {p.when}
                {p.cancelled && " (cancelled)"}
              </span>
              {p.label && <span className="font-semibold">{p.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
