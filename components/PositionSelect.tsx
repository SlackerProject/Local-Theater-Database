"use client";

import { useState } from "react";
import { CREW_POSITIONS, knownPosition } from "@/lib/positions";

const OTHER = "__other";

// A crew position: pick from the standard list, or choose "Other…" and type
// it. Existing positions that aren't on the list open as "Other…".
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
  const known = knownPosition(value);
  const [other, setOther] = useState(!!value.trim() && !known);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <select
        id={id}
        value={other ? OTHER : (known ?? "")}
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
        {CREW_POSITIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {other && (
        <input
          aria-label="Position (other)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type the position"
          autoFocus
          className={className}
        />
      )}
    </div>
  );
}
