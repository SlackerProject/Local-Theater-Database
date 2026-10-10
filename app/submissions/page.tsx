import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isEmptyLeftOut, type Bundle, type BundlePerson, type LeftOut } from "@/lib/submission";
import { MarqueeBand, SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { reopenSubmission } from "./actions";

export const metadata: Metadata = { title: "Your submissions · Local Theater Database" };

export default function SubmissionsPage() {
  return (
    <>
      <SiteHeader />
      <MarqueeBand>Your submissions</MarqueeBand>
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 sm:px-8">
        <h1 className="m-0 font-serif text-[36px] font-normal leading-[1.05] sm:text-[44px]">Your submissions</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Submissions />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(date: string, time?: string) {
  const [y, m, d] = date.split("-").map(Number);
  if (!time) return `${MONTHS[m - 1]} ${d}, ${y}`;
  const [hh, mm] = time.split(":").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y} · ${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

function personName(people: BundlePerson[], key: string) {
  const p = people.find((x) => x.key === key);
  return p ? ("new" in p ? p.new.display_name : p.label) : "?";
}

async function Submissions() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/submissions");

  const supabase = await createClient();
  const [{ data: proposals }, { data: points }, { data: draft }] = await Promise.all([
    supabase
      .from("edit_proposals")
      .select("id, status, changes, approved_changes, left_out, entity_id, review_note, created_at, reviewed_at")
      .eq("entity_table", "production_submission")
      .eq("proposed_by", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("user_points").select("points").eq("user_id", user.id).maybeSingle(),
    supabase.from("submission_drafts").select("updated_at").eq("user_id", user.id).maybeSingle(),
  ]);

  const productionIds = (proposals ?? []).map((p) => p.entity_id).filter((id): id is string => !!id);
  const { data: productions } = productionIds.length
    ? await supabase.from("productions").select("id, slug").in("id", productionIds)
    : { data: [] };
  const slugFor = new Map((productions ?? []).map((p) => [p.id, p.slug]));

  // A submission whose items were already resubmitted doesn't offer it again
  const resubmitted = new Set(
    (proposals ?? []).map((p) => (p.changes as unknown as Bundle).resubmission_of).filter(Boolean),
  );

  return (
    <>
      <p className="m-0 text-muted">
        You’ve earned <strong className="text-ink">{points?.points ?? 0} points</strong> for approved contributions.
      </p>
      {draft && (
        <p className="m-0 rounded-[10px] border-[1.5px] border-marquee bg-marquee-tint p-3 text-[15px]">
          You have a saved draft.{" "}
          <Link href="/add" className="font-semibold text-accent no-underline">Continue it</Link>. Note that “Fix and
          resubmit” below replaces that draft.
        </p>
      )}
      {!proposals?.length && (
        <p className="m-0 text-muted">
          Nothing yet. <Link href="/add" className="font-semibold text-accent no-underline">Add a production</Link>.
        </p>
      )}

      {proposals?.map((p) => {
        const submitted = p.changes as unknown as Bundle;
        const approved = (p.approved_changes ?? p.changes) as unknown as Bundle;
        const leftOut = p.left_out as unknown as LeftOut | null;
        const partly = p.status === "approved" && !isEmptyLeftOut(leftOut);
        const canReopen = !resubmitted.has(p.id) && (p.status === "rejected" || partly);
        const status =
          p.status === "pending"
            ? { label: "Waiting for review", tone: "bg-chip" }
            : p.status === "rejected"
              ? { label: "Not approved", tone: "bg-accent/15 text-accent" }
              : partly
                ? { label: "Partly approved", tone: "bg-marquee" }
                : { label: "Approved", tone: "bg-marquee" };
        const slug = p.entity_id ? slugFor.get(p.entity_id) : undefined;

        return (
          <article key={p.id} className="flex flex-col gap-3 rounded-[14px] border border-rule bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 font-serif text-[26px] font-normal leading-[1.1]">
                {(p.status === "approved" ? approved : submitted).production.display_title}
              </h2>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>
            </div>
            <span className="text-sm text-muted">
              Submitted {new Date(p.created_at).toLocaleDateString("en-US", { timeZone: "America/New_York", dateStyle: "medium" })}
              {"id" in submitted.production && " · additions to a live production"}
            </span>

            {p.review_note && (
              <p className="m-0 rounded-[10px] border border-rule bg-background p-3 text-[15px]">
                <strong>Moderator’s note:</strong> {p.review_note}
              </p>
            )}

            {slug && (
              <Link href={`/production/${slug}`} className="font-semibold text-accent no-underline">
                View the production page
              </Link>
            )}

            {partly && leftOut && (
              <div className="flex flex-col gap-1">
                <h3 className="eyebrow m-0">Not approved yet</h3>
                <ul className="m-0 flex list-none flex-col p-0 text-[15px]">
                  {leftOut.location && (
                    <li className="border-b border-rule py-1.5">
                      Location: {"new" in leftOut.location ? leftOut.location.new.name : leftOut.location.label}
                    </li>
                  )}
                  {leftOut.performances.map((pf, i) => (
                    <li key={`pf${i}`} className="border-b border-rule py-1.5">
                      Performance: {shortDate(pf.date, pf.time)}
                      {pf.label && ` (${pf.label})`}
                    </li>
                  ))}
                  {leftOut.credits.map((c, i) => (
                    <li key={`c${i}`} className="border-b border-rule py-1.5">
                      {c.kind === "cast" ? "Cast" : "Crew"}: <strong>{c.role}</strong> · {personName(leftOut.people, c.person_key)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canReopen && (
              <form action={reopenSubmission}>
                <input type="hidden" name="id" value={p.id} />
                <button
                  type="submit"
                  className="inline-flex h-11 cursor-pointer items-center rounded-full border-0 bg-ink px-[18px] text-sm font-semibold text-white"
                >
                  {partly ? "Fix and resubmit these" : "Fix and resubmit"}
                </button>
              </form>
            )}
            {resubmitted.has(p.id) && <span className="text-sm text-muted">You’ve resubmitted this.</span>}
          </article>
        );
      })}
    </>
  );
}
