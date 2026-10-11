"use client";

import { useId, useState } from "react";
import { MA_TOWNS, maTown } from "@/lib/ma-towns";

// City or town: type a few letters, then pick one of Massachusetts' 351
// cities and towns. Only a town from the list can be chosen, so addresses
// stay consistent. Shows ", MA" after it, since the site covers
// Massachusetts only.
export function TownPicker({
  id,
  value,
  onChange,
  className = "field h-12 w-full max-w-[320px] px-3",
}: {
  id?: string;
  value: string;
  onChange: (town: string) => void;
  className?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const listId = `${inputId}-towns`;
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const chosen = maTown(value);
  const q = query.trim().toLowerCase();
  const matches = q
    ? [...MA_TOWNS.filter((t) => t.toLowerCase().startsWith(q)), ...MA_TOWNS.filter((t) => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q))].slice(0, 8)
    : [];

  function pick(town: string) {
    onChange(town);
    setQuery(town);
    setOpen(false);
  }

  return (
    <div className="relative flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          value={query}
          autoComplete="off"
          role="combobox"
          aria-controls={listId}
          aria-expanded={open && matches.length > 0}
          aria-autocomplete="list"
          placeholder="Start typing the town"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            // An exact name (any capitalization) becomes the list's spelling;
            // anything else is passed on as typed, for the form to flag
            onChange(maTown(e.target.value) ?? e.target.value);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) {
              e.preventDefault();
              pick(matches[0]);
            }
          }}
          className={className}
        />
        <span className="flex-none font-semibold text-muted">, MA</span>
      </div>
      {open && matches.length > 0 && !(chosen && matches.length === 1 && matches[0] === chosen) && (
        <ul id={listId} role="listbox" className="absolute left-0 top-full z-20 m-0 mt-1 flex w-full max-w-[320px] list-none flex-col overflow-hidden rounded-lg border border-[#CFCFCF] bg-page p-0 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
          {matches.map((t) => (
            <li key={t} role="option" aria-selected={t === chosen}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(t)}
                className="flex min-h-11 w-full cursor-pointer items-center border-0 bg-page px-3 text-left text-base hover:bg-soft"
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && !chosen && !open && (
        <span className="text-sm font-semibold">
          Choose a Massachusetts city or town from the list. Villages like East Walpole belong to their town (Walpole).
        </span>
      )}
    </div>
  );
}

// State: Massachusetts only, for now
export function StateSelect({ id, className = "field h-12 w-[110px] px-3" }: { id?: string; className?: string }) {
  return (
    <select id={id} value="MA" onChange={() => undefined} className={className}>
      <option value="MA">MA</option>
    </select>
  );
}
