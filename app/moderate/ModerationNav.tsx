import Link from "next/link";

const TABS = [
  { href: "/moderate", label: "Review queue" },
  { href: "/moderate/members", label: "Members" },
  { href: "/moderate/changes", label: "Recent changes" },
] as const;

// The moderators' tools, one tab each
export function ModerationNav({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Moderation" className="flex flex-wrap gap-x-6 border-b border-rule">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={`link-quiet -mb-px inline-flex min-h-11 items-center border-b-2 text-[15px] font-semibold ${
            t.href === current ? "border-ink" : "border-transparent text-muted"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
