import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const TABS = [
  { href: "/moderate", label: "Review queue" },
  { href: "/moderate/members", label: "Members" },
  { href: "/moderate/changes", label: "Recent changes" },
  { href: "/moderate/bugs", label: "Feedback" },
] as const;

// The moderators' tools, one tab each; the review queue shows how many
// decisions are waiting (in red), Feedback how many are open
export async function ModerationNav({ current }: { current: (typeof TABS)[number]["href"] }) {
  const supabase = await createClient();
  const [{ count }, { data: waiting }] = await Promise.all([
    supabase.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.rpc("moderation_pending_count"),
  ]);

  return (
    <nav aria-label="Moderation" className="flex flex-wrap gap-x-6 border-b border-rule">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`link-quiet -mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 text-[15px] font-semibold ${
            t.href === current ? "border-ink" : "border-transparent text-muted"
          }`}
        >
          {t.label}
          {t.href === "/moderate" && !!waiting && (
            <span className="rounded-full bg-alert px-1.5 text-[12px] font-bold leading-5 text-white">
              {waiting}
              <span className="sr-only"> waiting</span>
            </span>
          )}
          {t.href === "/moderate/bugs" && !!count && (
            <span className="rounded bg-ink px-1.5 text-[12px] font-bold leading-5 text-white">
              {count}
              <span className="sr-only"> open</span>
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
