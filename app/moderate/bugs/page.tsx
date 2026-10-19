import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "../ModerationNav";
import { BugActions } from "./BugActions";
import { FeedbackReplyBox, FeedbackThread, type FeedbackMessage } from "@/components/FeedbackReply";
import { SITE_NAME } from "@/lib/brand";
import { FEEDBACK_KINDS, feedbackKind } from "@/lib/feedback";

export const metadata: Metadata = { title: "Feedback · Moderation" };

export default function FeedbackPage({ searchParams }: PageProps<"/moderate/bugs">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <ModerationNav current="/moderate/bugs" />
          <Feedback searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

type Details = { browser?: string; window?: string; screen?: string; language?: string; came_from?: string | null; local_time?: string; errors?: string[] };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

// A plain, short guess at the browser for people (the full text is in the copy)
function browserName(ua = "") {
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "";
  return os ? `${b} on ${os}` : b;
}

// Feedback from the footer's "Give feedback": bugs, ideas, wrong
// information and anything else, filtered by kind (?kind=) and by whether
// it's still open (?show=all)
async function Feedback({ searchParams }: Pick<PageProps<"/moderate/bugs">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate/bugs");
  if (!hasRole(user, "moderator")) return <p className="text-muted">Only moderators and the admin can see feedback.</p>;

  const { show, kind: kindParam } = await searchParams;
  const all = show === "all";
  const kind = FEEDBACK_KINDS.some((k) => k.value === kindParam) ? (kindParam as string) : null;
  const supabase = await createClient();
  let query = supabase
    .from("bug_reports")
    .select("id, kind, page_url, message, details, status, created_at, resolved_at, reported_by, reporter:profiles!bug_reports_reported_by_fkey(username, display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!all) query = query.eq("status", "open");
  if (kind) query = query.eq("kind", kind);
  const [{ data: reports, error }, { data: openRows }] = await Promise.all([
    query,
    supabase.from("bug_reports").select("kind").eq("status", "open").limit(1000),
  ]);
  const { data: messageRows } = reports?.length
    ? await supabase
        .from("feedback_messages")
        .select("id, bug_report_id, from_moderator, body, created_at, author:profiles!feedback_messages_author_id_fkey(display_name)")
        .in("bug_report_id", reports.map((r) => r.id))
        .order("created_at")
    : { data: [] };
  const thread = (id: string): FeedbackMessage[] => (messageRows ?? []).filter((m) => m.bug_report_id === id);
  const openCount = (k: string | null) => (openRows ?? []).filter((r) => !k || r.kind === k).length;

  const href = (next: { kind?: string | null; all?: boolean }) => {
    const params = new URLSearchParams();
    const k = next.kind === undefined ? kind : next.kind;
    if (k) params.set("kind", k);
    if (next.all ?? all) params.set("show", "all");
    const q = params.toString();
    return `/moderate/bugs${q ? `?${q}` : ""}`;
  };
  const chip = "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold link-quiet";

  return (
    <>
      <p className="m-0 max-w-[720px] text-[15px] text-muted">
        What people sent with “Give feedback” in the footer. <strong className="text-ink">Copy for Claude</strong> copies the page, the
        message and the technical details, ready to paste into a chat. If something was filed under the wrong kind, change it with{" "}
        <strong className="text-ink">Kind</strong>. <strong className="text-ink">Reply</strong> writes back to the sender; they see it in
        their notifications and can answer, which reopens the feedback.
      </p>

      <nav aria-label="Kinds of feedback" className="flex flex-wrap items-center gap-2">
        {[{ value: null, short: "All" }, ...FEEDBACK_KINDS].map((k) => {
          const on = kind === k.value;
          const n = openCount(k.value);
          return (
            <Link
              key={k.short}
              href={href({ kind: k.value })}
              aria-current={on ? "page" : undefined}
              className={`${chip} ${on ? "border-ink bg-ink text-white" : "border-[#CFCFCF] bg-page text-ink hover:border-ink"}`}
            >
              {k.value ? feedbackKind(k.value).label : "All"}
              {n > 0 && <span className={on ? "text-white/80" : "text-muted"}>{n}</span>}
            </Link>
          );
        })}
        <Link href={href({ all: !all })} className="ml-auto font-semibold">
          {all ? "Show open only" : "Include done and dismissed"}
        </Link>
      </nav>

      {error && <p className="callout m-0">Couldn’t load feedback: {error.message}</p>}
      {!reports?.length && !error && <p className="m-0 text-muted">{all ? "No feedback here yet." : "Nothing open here."}</p>}

      {reports?.map((r) => {
        const d = (r.details ?? {}) as Details;
        const k = feedbackKind(r.kind);
        const who = r.reporter ? `${r.reporter.display_name} (@${r.reporter.username})` : "a signed-out visitor";
        const copyText = [
          `${k.label} (feedback from ${SITE_NAME})`,
          `Page: ${r.page_url}`,
          `Sent: ${when(r.created_at)} by ${who}`,
          "",
          `${k.prompt}`,
          r.message,
          "",
          "Technical details:",
          `- Browser: ${d.browser ?? "unknown"}`,
          `- Window: ${d.window ?? "?"} (screen ${d.screen ?? "?"}), language ${d.language ?? "?"}`,
          `- Their local time: ${d.local_time ?? "?"}`,
          `- Came from: ${d.came_from || "(direct)"}`,
          `- Page errors: ${d.errors?.length ? "\n  " + d.errors.join("\n  ") : "none recorded"}`,
        ].join("\n");

        return (
          <article key={r.id} className={`flex flex-col gap-2.5 border-t border-rule pt-4 ${r.status !== "open" ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="tag">{k.short}</span>
                <a href={r.page_url} target="_blank" rel="noopener noreferrer" className="break-all font-bold">
                  {r.page_url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                </a>
              </span>
              <span className="text-sm text-muted">
                {when(r.created_at)} · {who}
                {r.status !== "open" && ` · ${r.status === "fixed" ? (r.kind === "bug" ? "Fixed" : "Done") : "Dismissed"}`}
              </span>
            </div>
            <p className="callout m-0 whitespace-pre-line">{r.message}</p>
            <span className="text-sm text-muted">
              {browserName(d.browser)} · window {d.window ?? "?"}
              {d.errors?.length ? ` · ${d.errors.length} page ${d.errors.length === 1 ? "error" : "errors"}` : ""}
            </span>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Copy text</summary>
              <pre className="m-0 mt-2 whitespace-pre-wrap break-words rounded-md bg-soft p-3 font-mono text-[13px]">{copyText}</pre>
            </details>
            <FeedbackThread messages={thread(r.id)} viewer="moderator" />
            {r.reported_by ? (
              <FeedbackReplyBox id={r.id} viewer="moderator" open={r.status === "open"} />
            ) : (
              <span className="text-sm text-muted">Sent while signed out, so there’s no one to reply to.</span>
            )}
            <BugActions id={r.id} kind={r.kind} status={r.status} copyText={copyText} />
          </article>
        );
      })}
    </>
  );
}
