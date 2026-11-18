// A short run, for poster captions: "Nov 6–21", "Nov 28 – Dec 21", "Nov 6"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const parts = (d: string) => ({ month: MONTHS[Number(d.slice(5, 7)) - 1], day: Number(d.slice(8, 10)) });

export function shortRun(opening: string | null, closing: string | null): string {
  const first = opening ?? closing;
  if (!first) return "";
  const a = parts(first);
  if (!opening || !closing || opening === closing) return `${a.month} ${a.day}`;
  const b = parts(closing);
  if (a.month === b.month && opening.slice(0, 4) === closing.slice(0, 4)) return `${a.month} ${a.day}–${b.day}`;
  return `${a.month} ${a.day} – ${b.month} ${b.day}`;
}
