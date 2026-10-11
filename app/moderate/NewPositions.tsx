"use client";

// Positions in a submission that aren't on the list yet ("Other…"). The
// moderator can tick any to add to the list permanently when they approve.
export function NewPositions({
  positions,
  selected,
  onChange,
}: {
  positions: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  if (!positions.length) return null;
  return (
    <fieldset className="m-0 flex flex-col gap-1 rounded-lg border border-[#CFCFCF] p-3">
      <legend className="px-1 text-[15px] font-bold">New positions</legend>
      <span className="text-sm text-muted">
        {positions.length === 1 ? "This position isn’t" : "These positions aren’t"} on the list yet. Tick to add to the list for
        everyone when you approve. New positions go at the end of the creative team order.
      </span>
      {positions.map((p) => (
        <label key={p} className="flex min-h-10 cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={selected.has(p)}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(p);
              else next.delete(p);
              onChange(next);
            }}
            className="h-5 w-5 accent-ink"
          />
          Add “{p}” to the positions list
        </label>
      ))}
    </fieldset>
  );
}
