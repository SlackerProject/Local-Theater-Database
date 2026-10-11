"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CREW_POSITIONS } from "@/lib/positions";

const OTHER = "__other";

// The positions list lives in the database (moderators can add to it), so
// it's loaded once per page view; the built-in list shows until it arrives
let cached: string[] | null = null;
let loading: Promise<string[]> | null = null;

function loadPositions() {
  if (cached) return Promise.resolve(cached);
  loading ??= Promise.resolve(createClient().from("crew_positions").select("name")).then(({ data }) => {
    cached = data?.length ? data.map((p) => p.name) : [...CREW_POSITIONS];
    return cached;
  });
  return loading;
}

const alphabetical = (list: readonly string[]) => [...list].sort((a, b) => a.localeCompare(b));

// A crew position: pick from the list (A to Z), or choose "Other…" and type
// it. Positions that aren't on the list open as "Other…".
export function PositionSelect({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (position: string) => void;
  className: string;
}) {
  const [positions, setPositions] = useState<string[]>(() => alphabetical(cached ?? CREW_POSITIONS));
  const known = positions.find((p) => p.toLowerCase() === value.trim().toLowerCase()) ?? null;
  const [other, setOther] = useState(!!value.trim() && !known);

  useEffect(() => {
    let live = true;
    loadPositions().then((list) => live && setPositions(alphabetical(list)));
    return () => {
      live = false;
    };
  }, []);

  const showOther = other || (!!value.trim() && !known);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <select
        id={id}
        value={showOther ? OTHER : (known ?? "")}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOther(true);
            onChange("");
          } else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
        className={className}
      >
        <option value="">Choose a position…</option>
        {positions.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {showOther && (
        <input
          aria-label="Position (other)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type the position"
          className={className}
        />
      )}
    </div>
  );
}
