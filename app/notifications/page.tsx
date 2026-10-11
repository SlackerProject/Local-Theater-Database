import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { describeChanges, type Revision } from "@/lib/changes";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ANNOUNCEMENT_KINDS, ANNOUNCEMENT_SELECT, announcement, announcementContext, auditionOffer } from "@/lib/announcements";
import { AnnouncementActions, AnnouncementText } from "@/components/Announcement";
import { ContributorMedal, pointsFor } from "@/components/badges/ContributorMedal";
import { KeepAllButton, NotificationActions } from "./NotificationActions";

export const metadata: Metadata = { title: "Notifications · Local Theater Database" };

export default function NotificationsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-10 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Notifications</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Notifications />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const STATUS: Record<string, string> = {
  kept: "You kept this change.",
  disputed: "You disputed this change. A moderator will review it.",
};

async function Notifications() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/notifications");

  const supabase = await createClient();
  const [{ data: rows }, { data: page }, { data: news }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, status, resolution, dispute_note, created_at, revision:revisions(id, entity_table, entity_id, action, before, after, changed_by, changed_at)")
      .eq("user_id", user.id)
      .eq("kind", "page_changed")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("people").select("slug, display_name").eq("verified_owner_id", user.id).maybeSingle(),
    supabase
      .from("notifications")
      .select(ANNOUNCEMENT_SELECT)
      .eq("user_id", user.id)
      .in("kind", [...ANNOUNCEMENT_KINDS])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const ctx = await announcementContext(
    supabase,
    user.id,
    (news ?? []).flatMap((n) => (n.production ? [n.production.id] : [])),
  );

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="heading">From people and companies you follow</h2>
        {news?.length ? (
          <ul className="m-0 flex list-none flex-col border-t border-rule p-0">
            {news.map((n) => {
              const a = announcement(n);
              if (!a) return null;
              const unread = n.status === "unread";
              return (
                <li key={n.id} className="flex gap-3 border-b border-rule py-4">
                  <span aria-hidden="true" className={`mt-2 h-2.5 w-2.5 flex-none rounded-full ${unread ? "bg-ink" : "bg-transparent"}`} />
                  <div className={`flex min-w-0 flex-1 flex-col gap-2 ${unread ? "" : "text-muted"}`}>
                    <span>
                      <AnnouncementText a={a} />
                      {unread && <span className="sr-only"> (new)</span>}
                    </span>
                    <span className="text-sm text-muted">{formatWhen(n.created_at)}</span>
                    {unread && (
                      <AnnouncementActions
                        id={n.id}
                        kind={a.kind}
                        productionId={a.productionId}
                        productionHref={a.production.href}
                        saved={ctx.saved.has(a.productionId)}
                        auditions={auditionOffer(a.kind, a.productionId, ctx)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 text-muted">
            Follow people and companies from their pages. When one of them is cast in a show, announces a production or
            posts audition dates, it will appear here.
          </p>
        )}
      </section>

      {(page || !!rows?.length) && (
        <ChangesToYourPage rows={rows ?? []} page={page} described={await describeChanges(supabase, (rows ?? []).map((r) => r.revision).filter((r): r is Revision => !!r))} />
      )}
      {!page && !rows?.length && (
        <p className="m-0 border-t border-rule pt-5 text-[15px] text-muted">
          Once you claim your person page and it’s verified, you’ll also be told here whenever someone else changes your
          page or credits.
        </p>
      )}
    </>
  );
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
}

type ChangeRow = {
  id: string;
  status: string;
  resolution: string | null;
  dispute_note: string | null;
  created_at: string;
  revision: Revision | null;
};

async function ChangesToYourPage({
  rows,
  page,
  described,
}: {
  rows: ChangeRow[];
  page: { slug: string } | null;
  described: Awaited<ReturnType<typeof describeChanges>>;
}) {
  const unread = rows.filter((r) => r.status === "unread").length;
  const points = await pointsFor(rows.map((r) => r.revision?.changed_by));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="heading">Changes to your page</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-muted">
          Changes other people made to {page ? <Link href={`/person/${page.slug}`}>your page</Link> : "your page"}. Keep
          each one, or dispute it and a moderator will take a look.
        </p>
        {unread > 1 && <KeepAllButton count={unread} />}
      </div>

      {!rows.length && <p className="m-0 text-muted">No changes yet. When someone edits your page or credits, it will appear here.</p>}

      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((n) => {
          const change = n.revision ? described.get(n.revision.id) : null;
          const when = formatWhen(n.created_at);
          return (
            <li key={n.id} className="flex flex-col gap-2.5 border-b border-rule py-4">
              <div className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-2 h-2.5 w-2.5 flex-none rounded-full ${n.status === "unread" ? "bg-ink" : "bg-transparent"}`}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={n.status === "unread" ? "font-semibold" : ""}>
                    {change ? (
                      <>
                        {change.who} <ContributorMedal points={n.revision?.changed_by ? points.get(n.revision.changed_by) : undefined} />{" "}
                        {change.summary}.
                      </>
                    ) : (
                      "Your page was changed."
                    )}
                    {n.status === "unread" && <span className="sr-only"> (new)</span>}
                  </span>
                  <span className="text-sm text-muted">
                    {when}
                    {change?.link && (
                      <>
                        {" · "}
                        <Link href={change.link.href}>{change.link.label}</Link>
                      </>
                    )}
                  </span>
                  {n.status === "resolved" ? (
                    <span className="text-sm text-muted">
                      A moderator reviewed your dispute and {n.resolution === "undone" ? "undid the change" : "kept the change"}.
                    </span>
                  ) : (
                    STATUS[n.status] && <span className="text-sm text-muted">{STATUS[n.status]}</span>
                  )}
                  {n.dispute_note && <span className="text-sm text-muted">Your note: “{n.dispute_note}”</span>}
                </div>
              </div>
              {n.status !== "resolved" && (
                <div className="pl-[22px]">
                  <NotificationActions id={n.id} status={n.status as "unread" | "kept" | "disputed"} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
