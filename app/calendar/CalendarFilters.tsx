"use client";

import { useRouter } from "next/navigation";

// "Show on calendar": hide or show the dashed runs. The choice lives in the
// address (?people=0, ?companies=0) so month navigation keeps it.
export function CalendarFilters({ people, companies, month }: { people: boolean; companies: boolean; month: string | null }) {
  const router = useRouter();

  function go(next: { people: boolean; companies: boolean }) {
    const q = new URLSearchParams();
    if (month) q.set("month", month);
    if (!next.people) q.set("people", "0");
    if (!next.companies) q.set("companies", "0");
    const s = q.toString();
    router.push(s ? `/calendar?${s}` : "/calendar", { scroll: false });
  }

  const box = "h-5 w-5 flex-none accent-ink";
  return (
    <>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
        <input type="checkbox" className={box} checked={people} onChange={(e) => go({ people: e.target.checked, companies })} />
        Runs with people I follow
      </label>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
        <input type="checkbox" className={box} checked={companies} onChange={(e) => go({ people, companies: e.target.checked })} />
        Runs from companies I follow
      </label>
    </>
  );
}
