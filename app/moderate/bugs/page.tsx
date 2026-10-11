import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { ModerationNav } from "../ModerationNav";
import { BugActions } from "./BugActions";
import { SITE_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Bug reports · Moderation" };

export default function BugsPage({ searchParams }: PageProps<"/moderate/bugs">) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <h1 className="display text-[40px] md:text-[56px]">Moderation</h1>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <ModerationNav current="/moderate/bugs" />
          <Bugs searchParams={searchParams} />
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

async function Bugs({ searchParams }: Pick<PageProps<"/moderate/bugs">, "searchParams">) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?next=/moderate/bugs");
  if (!hasRole(user, "moderator")) return <p className="text-muted">Only moderators and the admin can see bug reports.</p>;

  const { show } = await searchParams;
  const all = show === "all";
  const supabase = await createClient();
  let query = supabase
    .from("bug_reports")
    .select("id, page_url, message, details, status, created_at, resolved_at, reporter:profiles!bug_reports_reported_by_fkey(username, display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!all) query = query.eq("status", "open");
  const { data: reports, error } = await query;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[720px] text-[15px] text-muted">
          Problems people reported with “Report a problem” in the footer. <strong className="text-ink">Copy for Claude</strong>{" "}
          copies the page, the description and the technical details, ready to paste into a chat.
        </p>
        <Link href={all ? "/moderate/bugs" : "/moderate/bugs?show=all"} className="font-semibold">
          {all ? "Show open reports only" : "Show all reports"}
        </Link>
      </div>
      {error && <p className="callout m-0">Couldn’t load bug reports: {error.message}</p>}
      {!reports?.length && !error && <p className="m-0 text-muted">{all ? "No bug reports yet." : "No open bug reports."}</p>}

      {reports?.map((r) => {
        const d = (r.details ?? {}) as Details;
        const who = r.reporter ? `${r.reporter.display_name} (@${r.reporter.username})` : "a signed-out visitor";
        const copyText = [
          `Bug report from ${SITE_NAME}`,
          `Page: ${r.page_url}`,
          `Reported: ${when(r.created_at)} by ${who}`,
          "",
          "What went wrong:",
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
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <a href={r.page_url} target="_blank" rel="noopener noreferrer" className="break-all font-bold">
                {r.page_url.replace(/^https?:\/\/[^/]+/, "") || "/"}
              </a>
              <span className="text-sm text-muted">
                {when(r.created_at)} · {who}
                {r.status !== "open" && ` · ${r.status === "fixed" ? "Fixed" : "Dismissed"}`}
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
            <BugActions id={r.id} status={r.status} copyText={copyText} />
          </article>
        );
      })}
    </>
  );
}
