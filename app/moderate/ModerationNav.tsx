import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Fixing the site's data: one tab, with these inside it
const DATA = [
  { href: "/moderate/duplicates", label: "Duplicates" },
  { href: "/moderate/suggestions", label: "Data Suggestions" },
  { href: "/moderate/bulk", label: "Bulk Upload" },
] as const;

const TABS = [
  { href: "/moderate", label: "Review queue" },
  { href: "/moderate/members", label: "Members" },
  { href: "/moderate/changes", label: "Recent changes" },
  { href: "/moderate/bugs", label: "Feedback" },
  { href: "/moderate/stats", label: "Stats" },
  { href: "/moderate/duplicates", label: "Data" },
  { href: "/awards/add", label: "Awards" },
] as const;

type Href = (typeof TABS)[number]["href"] | (typeof DATA)[number]["href"];

const badge = (n: number, what: string, red = false) => (
  <span className={`rounded${red ? "-full bg-alert" : " bg-ink"} px-1.5 text-[12px] font-bold leading-5 text-white`}>
    {n}
    <span className="sr-only"> {what}</span>
  </span>
);

// The moderators' tools, one tab each; the review queue shows how many
// decisions are waiting (in red), Feedback how many are open
export async function ModerationNav({ current }: { current: Href }) {
  const supabase = await createClient();
  const inData = DATA.some((d) => d.href === current);
  const [{ count }, { data: waiting }, { count: suggestions }] = await Promise.all([
    supabase.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.rpc("moderation_pending_count"),
    inData
      ? supabase
          .from("award_entries")
          .select("id", { count: "exact", head: true })
          .not("person_id", "is", null)
          .not("production_id", "is", null)
          .is("credit_id", null)
          .eq("credit_check_dismissed", false)
      : Promise.resolve({ count: 0 }),
  ]);
  const tab = (active: boolean) =>
    `link-quiet -mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 text-[15px] font-semibold ${active ? "border-ink" : "border-transparent text-muted"}`;

  return (
    <div className="flex flex-col gap-1">
      <nav aria-label="Moderation" className="flex flex-wrap gap-x-6 border-b border-rule">
        {TABS.map((t) => {
          const active = t.href === current || (t.label === "Data" && inData);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={tab(active)}>
              {t.label}
              {t.href === "/moderate" && !!waiting && badge(waiting, "waiting", true)}
              {t.href === "/moderate/bugs" && !!count && badge(count, "open")}
            </Link>
          );
        })}
      </nav>
      {inData && (
        <nav aria-label="Data tools" className="flex flex-wrap gap-2 pt-2">
          {DATA.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              aria-current={d.href === current ? "page" : undefined}
              className={`link-quiet inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold ${
                d.href === current ? "border-ink bg-ink text-white" : "border-rule"
              }`}
            >
              {d.label}
              {d.href === "/moderate/suggestions" && !!suggestions && d.href !== current && badge(suggestions, "suggestions")}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
