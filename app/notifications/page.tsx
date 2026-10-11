import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { describeChanges, type Revision } from "@/lib/changes";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { KeepAllButton, NotificationActions } from "./NotificationActions";

export const metadata: Metadata = { title: "Notifications · Local Theater Database" };

export default function NotificationsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
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
  const [{ data: rows }, { data: page }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, status, resolution, dispute_note, created_at, revision:revisions(id, entity_table, entity_id, action, before, after, changed_by, changed_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("people").select("slug, display_name").eq("verified_owner_id", user.id).maybeSingle(),
  ]);

  if (!page) {
    return (
      <p className="m-0 text-muted">
        Once you claim your person page and it’s verified, you’ll be told here whenever someone else changes your page or
        credits.
      </p>
    );
  }

  const revisions = (rows ?? []).map((r) => r.revision).filter((r): r is Revision => !!r);
  const described = await describeChanges(supabase, revisions);
  const unread = (rows ?? []).filter((r) => r.status === "unread").length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-muted">
          Changes other people made to <Link href={`/person/${page.slug}`}>your page</Link>. Keep each one, or dispute it
          and a moderator will take a look.
        </p>
        {unread > 1 && <KeepAllButton count={unread} />}
      </div>

      {!rows?.length && <p className="m-0 text-muted">No changes yet. When someone edits your page or credits, it will appear here.</p>}

      <ul className="m-0 flex list-none flex-col p-0">
        {rows?.map((n) => {
          const change = n.revision ? described.get(n.revision.id) : null;
          const when = new Date(n.created_at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
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
                        {change.who} {change.summary}.
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
    </>
  );
}
