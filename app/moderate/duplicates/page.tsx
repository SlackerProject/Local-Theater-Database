import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "../ModerationNav";
import { DuplicatePair, ManualMerge } from "./MergeTools";
import { NOUN, type MergeTable } from "@/lib/merge";

export const metadata: Metadata = { title: "Duplicates · Moderation" };

export default function DuplicatesPage({ searchParams }: PageProps<"/moderate/duplicates">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-8 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <ModerationNav current="/moderate/duplicates" />
          <Duplicates searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const TABLES: MergeTable[] = ["people", "productions", "shows", "organizations", "locations"];
// "1 productions" -> "1 production"
const one = (s: string | null) => (s ?? "").replace(/\b1 (production|credit)s\b/g, "1 $1");
const label = (t: MergeTable) => `${NOUN[t][0].toUpperCase()}${NOUN[t].slice(1)}s`;

// Likely duplicates to merge or dismiss, and a tool to merge any two pages
async function Duplicates({ searchParams }: Pick<PageProps<"/moderate/duplicates">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate/duplicates");
  if (!hasRole(user, "moderator")) return <p className="text-muted">Only moderators and the admin can merge pages.</p>;

  const { type } = await searchParams;
  const filter = TABLES.includes(type as MergeTable) ? (type as MergeTable) : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("potential_duplicates");
  const all = (data ?? []) as { entity_table: MergeTable; a_id: string; a_label: string; a_slug: string; a_detail: string | null; b_id: string; b_label: string; b_slug: string; b_detail: string | null; reason: string }[];
  const shown = filter ? all.filter((d) => d.entity_table === filter) : all;
  const count = (t: MergeTable | null) => all.filter((d) => !t || d.entity_table === t).length;
  const chip = "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold link-quiet";

  return (
    <>
      <p className="-mt-4 m-0 max-w-[760px] text-[15px] text-muted">
        Pages that might be the same person, show, company, venue or production. Open both to compare, then merge them, or mark them as{" "}
        <strong className="text-ink">Not a duplicate</strong> so they stop showing up here.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="heading">Potential Duplicates</h2>
        <nav aria-label="Kinds of pages" className="flex flex-wrap gap-2">
          {[null, ...TABLES].map((t) => {
            const on = filter === t;
            const n = count(t);
            return (
              <Link
                key={t ?? "all"}
                href={t ? `/moderate/duplicates?type=${t}` : "/moderate/duplicates"}
                aria-current={on ? "page" : undefined}
                className={`${chip} ${on ? "border-ink bg-ink text-white" : "border-[#CFCFCF] bg-page text-ink hover:border-ink"}`}
              >
                {t ? label(t) : "All"}
                <span className={on ? "text-white/80" : "text-muted"}>{n}</span>
              </Link>
            );
          })}
        </nav>
        {error && <p className="callout m-0">Couldn’t check for duplicates: {error.message}</p>}
        {!error && !shown.length && <p className="m-0 text-muted">No potential duplicates. All clear.</p>}
        <ul className="m-0 flex list-none flex-col border-t border-rule p-0">
          {shown.map((d) => (
            <DuplicatePair
              key={`${d.a_id}-${d.b_id}`}
              table={d.entity_table}
              a={{ id: d.a_id, label: d.a_label, slug: d.a_slug, detail: one(d.a_detail) }}
              b={{ id: d.b_id, label: d.b_label, slug: d.b_slug, detail: one(d.b_detail) }}
              reason={`${label(d.entity_table).slice(0, -1)} · ${d.reason}`}
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="heading">Merge Any Two Pages</h2>
        <p className="m-0 max-w-[760px] text-[15px] text-muted">For duplicates the list above doesn’t catch, such as a misspelled name.</p>
        <ManualMerge />
      </section>
    </>
  );
}
