// A plain placeholder where a production has no poster yet: a light grey
// panel with the show's title and "No poster yet". Nothing decorative; it
// only holds the place until the real poster is uploaded. The text scales
// with the panel (container units).
export function SimplePoster({ title }: { title: string; year?: number | string | null; company?: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="@container flex h-full w-full flex-col items-center justify-center gap-[4%] border border-rule bg-soft p-[8%] text-center"
    >
      <span className="line-clamp-4 font-semibold leading-tight text-[#5E5E5E] [overflow-wrap:anywhere]" style={{ fontSize: "9cqw" }}>
        {title}
      </span>
      <span className="text-[#8C8C8C]" style={{ fontSize: "6.5cqw" }}>
        No poster yet
      </span>
    </span>
  );
}
