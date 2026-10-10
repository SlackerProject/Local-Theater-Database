import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Bundle } from "@/lib/submission";
import { MarqueeBand, SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ReviewCard } from "./ReviewCard";

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
      {params.rejected && <Banner>Submission rejected and sent back to the contributor.</Banner>}
      {error && <p className="text-accent">Couldn’t load the queue: {error.message}</p>}
      {!proposals?.length && !error && <p className="m-0 text-muted">Nothing waiting for review. 🎭</p>}

      {proposals?.map((p) => (
        <ReviewCard
          key={p.id}
          id={p.id}
          submitted={p.changes as unknown as Bundle}
          submittedBy={`${p.proposer?.display_name} (@${p.proposer?.username})`}
          submittedAt={new Date(p.created_at).toLocaleString("en-US", {
            timeZone: "America/New_York",
            dateStyle: "medium",
            timeStyle: "short",
          })}
        />
      ))}
    </>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="m-0 rounded-[10px] border-[1.5px] border-marquee bg-marquee-tint p-3">
      {children}
    </p>
  );
}
