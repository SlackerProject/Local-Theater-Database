// Shared look for the edit page: plain and clear over stylish, with
// buttons that say what they do.

export const small =
  "inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md border border-[#CFCFCF] bg-page px-2.5 text-sm font-semibold hover:border-ink";
export const input = "field h-11 w-full max-w-[460px] px-3";
export const changedRow = "bg-[#FFF6D6]";

export function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
export const PENCIL = "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4";
export const CROSS = "M6 6l12 12M18 6L6 18";
export const PLUS = "M12 5v14M5 12h14";
export const UNDO = "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3";
