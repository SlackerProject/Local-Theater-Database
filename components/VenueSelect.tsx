export type VenueOption = { id: string; name: string; town: string | null };

// A dropdown of the venues listed on the site, grouped by town. The empty
// choice comes first (e.g. "Same as the main venue").
export function VenueSelect({
  value,
  venues,
  onChange,
  emptyLabel,
  label,
  className = "field h-11 w-full px-3",
}: {
  value: string;
  venues: VenueOption[];
  onChange: (id: string) => void;
  emptyLabel: string;
  label: string; // for screen readers
  className?: string;
}) {
  const towns = [...new Set(venues.map((v) => v.town || "Other"))].sort((a, b) => a.localeCompare(b));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={className}>
      <option value="">{emptyLabel}</option>
      {towns.map((town) => (
        <optgroup key={town} label={town}>
          {venues
            .filter((v) => (v.town || "Other") === town)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
