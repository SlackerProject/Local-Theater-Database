import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Bundle } from "@/lib/submission";
import { MarqueeBand, SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { approveSubmission, rejectSubmission } from "./actions";

export const metadata: Metadata = { title: "Moderation queue · Local Theater Database" };

export default function ModeratePage({ searchParams }: PageProps<"/moderate">) {
  return (
    <>
      <SiteHeader />
      <MarqueeBand>Moderation</MarqueeBand>
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 sm:px-8">
        <h1 className="m-0 font-serif text-[36px] font-normal leading-[1.05] sm:text-[44px]">Pending submissions</h1>
        <Suspense fallback={<p className="text-muted">Loading the queue…</p>}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/moderate">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate");
  if (!hasRole(user, "moderator")) {
    return <p className="text-muted">Only moderators and admins can see the moderation queue.</p>;
  }

  const params = await searchParams;
  const supabase = await createClient();
  const { data: proposals, error } = await supabase
    .from("edit_proposals")
    .select("id, changes, created_at, proposer:profiles!edit_proposals_proposed_by_fkey(username, display_name)")
    .eq("entity_table", "production_submission")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return (
    <>
      {typeof params.approved === "string" && (
        <Banner>
          Approved and published.{" "}
          {params.approved && (
            <Link href={`/production/${params.approved}`} className="font-semibold text-accent no-underline">
              View the production page
            </Link>
          )}
        </Banner>
      )}
      {params.rejected && <Banner>Submission rejected.</Banner>}
      {typeof params.error === "string" && (
        <p role="alert" className="m-0 rounded-[10px] border-[1.5px] border-accent/40 bg-accent/5 p-3 text-accent">
          That didn’t work: {params.error}
        </p>
      )}
      {error && <p className="text-accent">Couldn’t load the queue: {error.message}</p>}
      {!proposals?.length && !error && <p className="m-0 text-muted">Nothing waiting for review. 🎭</p>}

      {proposals?.map((p) => {
        const b = p.changes as unknown as Bundle;
        return (
          <article key={p.id} className="flex flex-col gap-4 rounded-[14px] border border-rule bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="m-0 font-serif text-[28px] font-normal leading-[1.1]">{b.production?.display_title}</h2>
              <span className="text-sm text-muted">
                Submitted by {p.proposer?.display_name} (@{p.proposer?.username}) on{" "}
                {new Date(p.created_at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>

            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-2">
              <Fact term="Show" value={refLabel(b.show, (n) => `${n.title} (${n.type})`)} isNew={"new" in b.show} />
              <Fact term="Company" value={refLabel(b.organization, (n) => [n.name, n.town].filter(Boolean).join(", "))} isNew={"new" in b.organization} />
              <Fact
                term="Location"
                value={b.location ? refLabel(b.location, (n) => [n.name, n.street_address, n.town].filter(Boolean).join(", ")) : "—"}
                isNew={!!b.location && "new" in b.location}
              />
              <Fact term="Dates" value={[b.production?.opening_date, b.production?.closing_date].filter(Boolean).join(" to ") || "—"} />
            </dl>

            {b.performances?.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="eyebrow m-0">Performances ({b.performances.length})</h3>
                <p className="m-0 text-[15px] text-muted">
                  {b.performances.map((pf) => `${pf.date} ${pf.time}${pf.label ? ` (${pf.label})` : ""}`).join(" · ")}
                </p>
              </div>
            )}

            {b.credits?.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="eyebrow m-0">Cast and crew ({b.credits.length})</h3>
                <ul className="m-0 flex list-none flex-col p-0">
                  {b.credits.map((c, i) => {
                    const person = b.people.find((x) => x.key === c.person_key);
                    const isNew = !!person && "new" in person;
                    return (
                      <li key={i} className="flex flex-wrap items-center gap-2 border-b border-rule py-2 text-[15px]">
                        <span className="text-muted">{c.kind === "cast" ? "Cast" : "Crew"} ·</span>
                        <strong>{c.role}</strong>
                        <span>{person ? ("new" in person ? person.new.display_name : person.label) : "?"}</span>
                        <Tag isNew={isNew} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-4">
              <form action={approveSubmission}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="inline-flex h-12 cursor-pointer items-center rounded-full border-0 bg-accent px-6 font-semibold text-white">
                  Approve
                </button>
              </form>
              <form action={rejectSubmission} className="flex flex-[1_1_320px] flex-wrap items-end gap-2.5">
                <input type="hidden" name="id" value={p.id} />
                <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1">
                  <label htmlFor={`note-${p.id}`} className="text-sm font-semibold">
                    Note to the contributor <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input id={`note-${p.id}`} name="note" type="text" className="field h-12 rounded-[10px] px-3.5" />
                </div>
                <button type="submit" className="inline-flex h-12 cursor-pointer items-center rounded-full border-[1.5px] border-field bg-surface px-6 font-semibold text-ink">
                  Reject
                </button>
              </form>
            </div>
          </article>
        );
      })}
    </>
  );
}

function refLabel<N>(ref: { id: string; label: string } | { new: N }, describeNew: (n: N) => string) {
  return "new" in ref ? describeNew(ref.new) : ref.label;
}

function Fact({ term, value, isNew }: { term: string; value: string; isNew?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm font-semibold text-muted">{term}</dt>
      <dd className="m-0 flex flex-wrap items-center gap-2">
        {value}
        {isNew !== undefined && value !== "—" && <Tag isNew={isNew} />}
      </dd>
    </div>
  );
}

function Tag({ isNew }: { isNew: boolean }) {
  return isNew ? (
    <span className="rounded-full bg-marquee px-2.5 py-[3px] text-xs font-bold">New</span>
  ) : (
    <span className="rounded-full bg-chip px-2.5 py-[3px] text-xs font-bold">In database</span>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="m-0 rounded-[10px] border-[1.5px] border-marquee bg-marquee-tint p-3">
      {children}
    </p>
  );
}
