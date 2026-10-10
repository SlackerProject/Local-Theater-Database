"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Choice, Match } from "@/lib/submission";

export type LookupKind = "shows" | "organizations" | "locations" | "people";

export async function lookup(kind: LookupKind, query: string): Promise<Match[]> {
  if (query.trim().length < 2) return [];
  const { data } = await createClient().rpc("lookup", { p_kind: kind, p_query: query });
  return data ?? [];
}

type Props = {
  kind: LookupKind;
  noun: string; //        "show" -> "+ Add “X” as a new show"
  label: string;
  query: string;
  choice: Choice;
  onQueryChange: (query: string) => void;
  onPick: (match: Match) => void;
  onAddNew: () => void;
  // Left the field without picking anything; receives the current matches
  onLeaveUnresolved?: (matches: Match[]) => void;
  size?: "large" | "small";
};

export function TypeAhead({
  kind,
  noun,
  label,
  query,
  choice,
  onQueryChange,
  onPick,
  onAddNew,
  onLeaveUnresolved,
  size = "large",
}: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const requestSeq = useRef(0);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const trimmed = query.trim();
  const searching = choice.kind === "none" && trimmed.length >= 2;

  // Debounced search; ignore answers to older keystrokes
  useEffect(() => {
    if (!searching) return;
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      const result = await lookup(kind, trimmed);
      if (seq === requestSeq.current) {
        setMatches(result);
        setActive(0);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [kind, trimmed, searching]);

  const showList = open && searching;
  const optionCount = matches.length + 1; // + "Add new"

  function choose(index: number) {
    clearTimeout(leaveTimer.current);
    setOpen(false);
    if (index < matches.length) onPick(matches[index]);
    else onAddNew();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) {
      if (e.key === "ArrowDown" && searching) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % optionCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + optionCount) % optionCount);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const inputClass =
    size === "large" ? "field h-12 rounded-[10px] px-3.5" : "field h-11 rounded-lg px-3";

  return (
    <div className={`flex flex-col ${size === "large" ? "gap-1.5" : "gap-1"}`}>
      <label htmlFor={id} className={size === "large" ? "font-semibold" : "text-sm font-semibold"}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={query}
        className={`${inputClass} box-border w-full min-w-0`}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Let a click on an option land first
          leaveTimer.current = setTimeout(() => {
            setOpen(false);
            if (choice.kind === "none" && trimmed.length >= 2) onLeaveUnresolved?.(matches);
          }, 150);
        }}
      />
      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label={`Matching ${kind === "people" ? "people" : noun + "s"}`}
          className="overflow-hidden rounded-[10px] border border-rule"
        >
          {matches.map((m, i) => (
            <div
              key={m.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-[52px] cursor-pointer items-center justify-between gap-3 border-b border-rule px-3.5 py-2 ${
                i === active ? "bg-background" : ""
              }`}
            >
              <span>
                <strong>{m.label}</strong>
                {m.detail && <span className="text-muted"> · {m.detail}</span>}
              </span>
              {i === active && <InDatabasePill />}
            </div>
          ))}
          <div
            id={`${listId}-${matches.length}`}
            role="option"
            aria-selected={active === matches.length}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(matches.length)}
            onMouseEnter={() => setActive(matches.length)}
            className={`flex min-h-[52px] cursor-pointer items-center px-3.5 py-2 font-semibold text-accent ${
              active === matches.length ? "bg-background" : ""
            }`}
          >
            + Add “{trimmed}” as a new {noun}
          </div>
        </div>
      )}
    </div>
  );
}

export function InDatabasePill() {
  return (
    <span className="flex-none rounded-full bg-chip px-2.5 py-[3px] text-xs font-bold">In database</span>
  );
}

export function NewPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex-none rounded-full bg-marquee px-2.5 py-[3px] text-xs font-bold text-ink">{children}</span>
  );
}

// Under a field once an existing record is picked
export function PickedLine({ match, onChange }: { match: Match; onChange: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
      <InDatabasePill />
      {match.detail && <span>{match.detail}</span>}
      <button
        type="button"
        onClick={onChange}
        className="inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 font-semibold text-accent"
      >
        Change
      </button>
    </div>
  );
}
