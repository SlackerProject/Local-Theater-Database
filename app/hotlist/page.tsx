import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getHotProductions, hotlistUpdated, type Move } from "@/lib/hotlist";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Hotlist" };

export default function HotlistPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <div className="flex flex-col gap-2">
          <h1 className="display text-[40px] md:text-[56px]">Hotlist</h1>
          <p className="m-0 italic text-muted">The 20 most-visited productions over the last 7 days, counted once per visitor per day.</p>
        </div>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <List />
          <Updated />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function List() {
  const rows = await getHotProductions(20);
  if (!rows.length) return <p className="m-0 text-muted">Production pages visited this week will appear here.</p>;

  return (
    <ol className="m-0 list-none border-t border-rule p-0">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={r.href} className="link-quiet flex items-center gap-4 border-b border-rule py-3">
            <span className="w-10 flex-none text-right text-[28px] font-extrabold tabular-nums leading-none text-muted">{r.rank}</span>
            <span aria-hidden="true" className="flex h-[60px] w-12 flex-none overflow-hidden rounded-[4px] border" style={{ background: r.background, borderColor: r.borderColor }}>
              {r.poster ? (
                <img src={r.poster} alt="" className="block h-full w-full object-contain" />
              ) : (
                <span className="self-end p-1 text-[9px] font-extrabold leading-tight text-muted">{r.showTitle}</span>
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-bold">{r.name}</span>
              <span className="truncate text-sm text-muted">{[r.company, r.dates].filter(Boolean).join(" · ")}</span>
            </span>
            <MoveMarker move={r.move} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

async function Updated() {
  return <p className="-mt-4 m-0 text-sm text-muted">{await hotlistUpdated()}</p>;
}

// Compared with last week, when there's a week of history
function MoveMarker({ move }: { move: Move }) {
  if (!move) return null;
  if (move.kind === "new") return <span className="flex-none rounded bg-soft px-1.5 text-[13px] font-bold">New</span>;
  return (
    <span className="inline-flex flex-none items-center gap-0.5 text-[13px] font-semibold text-muted" title={`${move.kind === "up" ? "Up" : "Down"} ${move.by} since last week`}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d={move.kind === "up" ? "M12 19V5M5 12l7-7 7 7" : "M12 5v14M5 12l7 7 7-7"} />
      </svg>
      {move.by}
      <span className="sr-only">{move.kind === "up" ? " places up" : " places down"} since last week</span>
    </span>
  );
}
